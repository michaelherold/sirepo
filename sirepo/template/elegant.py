# -*- coding: utf-8 -*-
u"""elegant execution template.

:copyright: Copyright (c) 2015 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkcompat
from pykern import pkio
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdlog, pkdp
from sirepo import simulation_db
from sirepo.template import code_variable
from sirepo.template import elegant_command_importer
from sirepo.template import elegant_common
from sirepo.template import elegant_lattice_importer
from sirepo.template import lattice
from sirepo.template import template_common
from sirepo.template.lattice import LatticeUtil
from sirepo.template.madx_converter import MadxConverter
import copy
import glob
import math
import os
import os.path
import py.path
import re
import sirepo.lib
import sirepo.sim_data
import stat

_SIM_DATA, SIM_TYPE, _SCHEMA = sirepo.sim_data.template_globals()

ELEGANT_LOG_FILE = 'elegant.log'

WANT_BROWSER_FRAME_CACHE = True

_ERROR_RE = re.compile(
    r'^warn|^error|wrong units|^fatal |no expansion for entity|unable to|warning\:|^0 particles left|^unknown token|^terminated by sig|no such file or directory|no parameter name found|Problem opening |Terminated by SIG|No filename given|^MPI_ERR',
    re.IGNORECASE,
)

_ERROR_IGNORE_RE = re.compile(
    r'^warn.* does not have a parameter',
    re.IGNORECASE,
)

_ELEGANT_SEMAPHORE_FILE = 'run_setup.semaphore'

_MPI_IO_WRITE_BUFFER_SIZE = '1048576'

_FIELD_LABEL = PKDict(
    x='x [m]',
    xp="x' [rad]",
    y='y [m]',
    yp="y' [rad]",
    t='t [s]',
    p='p (mₑc)',
    s='s [m]',
    LinearDensity='Linear Density (C/s)',
    LinearDensityDeriv='LinearDensityDeriv (C/s²)',
    GammaDeriv='GammaDeriv (1/m)',
)

_OUTPUT_INFO_FILE = 'outputInfo.json'

_OUTPUT_INFO_VERSION = '3'

_PLOT_TITLE = PKDict({
    'x-xp': 'Horizontal',
    'y-yp': 'Vertical',
    'x-y': 'Cross-section',
    't-p': 'Longitudinal',
})

_SDDS_INDEX = None

_SIMPLE_UNITS = ['m', 's', 'C', 'rad', 'eV']

_X_FIELD = 's'

class CommandIterator(lattice.ElementIterator):

    def start(self, model):
        super(CommandIterator, self).start(model)
        if model._type == 'run_setup':
            self.fields.append(['semaphore_file', _ELEGANT_SEMAPHORE_FILE])
        elif model._type == 'global_settings':
            self.fields.append(['mpi_io_write_buffer_size', _MPI_IO_WRITE_BUFFER_SIZE])


class LibAdapter(sirepo.lib.LibAdapterBase):

    def parse_file(self, path):

        def _input_files(model_type):
            return [k for k, v in _SCHEMA.model[model_type].items() if 'InputFile' in v[1]];

        def _verify_files(model, model_type):
            self._verify_files(
                path,
                [model[x] for x in filter(
                    lambda f: model[f],
                    _input_files(model_type),
                )],
            )

        d = parse_input_text(path, update_filenames=False)
        r = self._run_setup(d)
        l = r.lattice
        d = parse_input_text(
            self._lattice_path(path.dirpath(), d),
            input_data=d,
            update_filenames=False,
        )
        for i in d.models.elements:
            _verify_files(i, i.type)
        for i in d.models.commands:
            _verify_files(i, lattice.LatticeUtil.model_name_for_data(i))
        r.lattice = l
        return self._convert(d)

    def write_files(self, data, source_path, dest_dir):
        """writes files for the simulation

        Returns:
            PKDict: structure of files written (debugging only)
        """

        def _unescape(value):
            return re.sub(r'\\\\', r'\\', value)

        class _G(_Generate):

            def _abspath(self, basename):
                return source_path.new(basename=basename)

            def _input_file(self, model_name, field, filename):
                return filename

            def _lattice_filename(self, value):
                return value

        g = _G(data, update_output_filenames=False)
        g.sim()
        v = g.jinja_env
        r = PKDict(
            commands=dest_dir.join(source_path.basename),
            lattice=self._lattice_path(dest_dir, data),
        )
        pkio.write_text(r.commands, _unescape(v.commands))
        if not r.lattice.exists():
            pkio.write_text(r.lattice, v.rpn_variables + v.lattice)
        self._write_input_files(data, source_path, dest_dir)
        f = g.filename_map
        r.output_files = [f[k] for k in f.keys_in_order]
        return r

    def _lattice_path(self, dest_dir, data):
        return dest_dir.join(self._run_setup(data).lattice)

    def _run_setup(self, data):
        return LatticeUtil.find_first_command(data, 'run_setup')


class OutputFileIterator(lattice.ModelIterator):

    def __init__(self, update_filenames):
        self.result = PKDict(
            keys_in_order=[],
        )
        self.model_index = PKDict()
        self._update_filenames = update_filenames

    def field(self, model, field_schema, field):
        self.field_index += 1
        if field_schema[1] == 'OutputFile' and model[field]:
            if self._update_filenames:
                if LatticeUtil.is_command(model):
                    suffix = self._command_file_extension(model)
                    filename = '{}{}.{}.{}'.format(
                        model._type,
                        self.model_index[self.model_name] if self.model_index[self.model_name] > 1 else '',
                        field,
                        suffix,
                    )
                else:
                    filename = '{}.{}.sdds'.format(model.name, field)
            else:
                filename = model[field]
            k = LatticeUtil.file_id(model._id, self.field_index)
            self.result[k] = filename
            self.result.keys_in_order.append(k)

    def start(self, model):
        self.field_index = 0
        self.model_name = LatticeUtil.model_name_for_data(model)
        if self.model_name in self.model_index:
            self.model_index[self.model_name] += 1
        else:
            self.model_index[self.model_name] = 1

    def _command_file_extension(self, model):
        if model._type == 'save_lattice':
            return 'lte'
        if model._type == 'global_settings':
            return 'txt'
        return 'sdds'


class ElegantMadxConverter(MadxConverter):
    _BEAM_VARS = ['beta_x', 'beta_y', 'alpha_x', 'alpha_y', 'n_particles_per_bunch', 'dp_s_coupling'];
    _PARTICLE_MAP = PKDict(
        electron='electron',
        positron='positron',
        proton='proton',
        muon='negmuon',
        negmuon='muon',
        custom='other',
    )
    _FIELD_MAP = [
        ['DRIFT',
            ['DRIF', 'l'],
            ['CSRDRIFT', 'l'],
            ['EDRIFT', 'l'],
            ['LSCDRIFT', 'l'],
        ],
        ['SBEND',
            ['CSBEND', 'l', 'angle', 'k1', 'k2', 'e1', 'e2', 'h1', 'h2', 'tilt', 'hgap', 'fint'],
            ['SBEN', 'l', 'angle', 'k1', 'k2', 'e1', 'e2', 'h1', 'h2', 'tilt', 'hgap', 'fint'],
            ['CSRCSBEND', 'l', 'angle', 'k1', 'k2', 'e1', 'e2', 'h1', 'h2', 'tilt', 'hgap', 'fint'],
            ['KSBEND', 'l', 'angle', 'k1', 'k2', 'e1', 'e2', 'h1', 'h2', 'tilt', 'hgap', 'fint'],
            ['NIBEND', 'l', 'angle', 'e1', 'e2', 'tilt', 'hgap', 'fint'],
        ],
        ['RBEND',
            ['RBEN', 'l', 'angle', 'k1', 'k2', 'e1', 'e2', 'h1', 'h2', 'tilt', 'hgap', 'fint'],
            ['TUBEND', 'l', 'angle'],
        ],
        ['QUADRUPOLE',
            ['QUAD', 'l', 'k1', 'tilt'],
            ['KQUAD', 'l', 'k1', 'tilt'],
        ],
        ['SEXTUPOLE',
            ['SEXT', 'l', 'k2', 'tilt'],
            ['KSEXT', 'l', 'k2', 'tilt'],
        ],
        ['OCTUPOLE',
            ['OCTU', 'l', 'k3', 'tilt'],
            ['KOCT', 'l', 'k3', 'tilt'],
        ],
        ['SOLENOID',
            ['SOLE', 'l', 'ks'],
        ],
        ['MULTIPOLE',
         #TODO(pjm): compute knl and order from first knl value in madx
            ['MULT', 'tilt'],
        ],
        ['HKICKER',
            ['HKICK', 'l', 'kick', 'tilt'],
            ['EHKICK', 'l', 'kick', 'tilt'],
        ],
        ['VKICKER',
            ['VKICK', 'l', 'kick', 'tilt'],
            ['EVKICK', 'l', 'kick', 'tilt'],
        ],
        ['KICKER',
            ['KICKER', 'l', 'hkick', 'vkick', 'tilt'],
            ['EKICKER', 'l', 'hkick', 'vkick', 'tilt'],
        ],
        ['MARKER',
            ['MARK'],
        ],
        ['PLACEHOLDER',
            ['DRIF', 'l'],
        ],
        ['INSTRUMENT',
            ['DRIF', 'l'],
        ],
        ['ECOLLIMATOR',
            ['ECOL', 'l', 'x_max=xsize', 'y_max=ysize'],
        ],
        ['RCOLLIMATOR',
            ['RCOL', 'l', 'x_max=xsize', 'y_max=ysize'],
        ],
        ['COLLIMATOR apertype=ELLIPSE',
            ['ECOL', 'l', 'x_max=xsize', 'y_max=ysize'],
        ],
        ['COLLIMATOR apertype=RECTANGLE',
            ['RCOL', 'l', 'x_max=xsize', 'y_max=ysize'],
        ],
        ['RFCAVITY',
            ['RFCA', 'l', 'volt', 'freq', 'phase=lag'],
            ['MODRF', 'l', 'volt', 'freq', 'phase=lag'],
            ['RAMPRF', 'l', 'volt', 'freq', 'phase=lag'],
            ['RFCW', 'l', 'volt', 'freq', 'phase=lag'],
        ],
        ['TWCAVITY',
            ['RFDF', 'l', 'voltage=volt', 'frequency=freq', 'phase=lag'],
        ],
        ['HMONITOR',
            ['HMON', 'l'],
        ],
        ['VMONITOR',
            ['VMON', 'l'],
        ],
        ['MONITOR',
            ['MONI', 'l'],
            ['WATCH'],
        ],
        ['SROTATION',
            ['SROT', 'tilt=angle'],
        ],
    ]
    _FIELD_SCALE = PKDict(
        RFCAVITY=PKDict(
            freq='1e6',
            volt='1e6',
        ),
        TWCAVITY=PKDict(
            freq='1e6',
            volt='1e6',
        ),
    )


    def __init__(self):
        super().__init__(SIM_TYPE, self._FIELD_MAP, downcase_variables=True)

    def from_madx(self, madx):
        data = super().from_madx(madx)
        eb = LatticeUtil.find_first_command(data, 'bunched_beam')
        mb = LatticeUtil.find_first_command(madx, 'beam')
        for f in self._BEAM_VARS:
            v = self._find_var(madx, f)
            if v:
                eb[f] = v.value
        ers = LatticeUtil.find_first_command(data, 'run_setup')
        ers.p_central_mev = self.particle_energy.pc * 1e3
        eb.emit_x = mb.ex
        eb.emit_y = mb.ey
        eb.sigma_s = mb.sigt
        eb.sigma_dp = mb.sige

        if mb.particle != 'electron':
            data.models.commands.insert(0, PKDict(
                _id=LatticeUtil.max_id(data),
                _type='change_particle',
                name=self._PARTICLE_MAP.get(mb.particle, 'custom'),
                #TODO(pjm): custom particle should set mass_ratio and charge_ratio
            ))
        return data

    def to_madx(self, data):
        madx = super().to_madx(data)
        eb = LatticeUtil.find_first_command(data, 'bunched_beam')
        if not eb:
            return madx
        self.__normalize_elegant_beam(data, eb)
        mb = LatticeUtil.find_first_command(madx, 'beam')
        particle = LatticeUtil.find_first_command(data, 'change_particle')
        if particle:
            mb.particle = self._PARTICLE_MAP.get(particle.name, 'other')
            #TODO(pjm): other particle should set mass and charge
        else:
            mb.particle = 'electron'
        mb.energy = 0
        madx.models.bunch.beamDefinition = 'pc'
        madx.models.bunch.longitudinalMethod = '2'
        mb.pc = eb.p_central_mev * 1e-3
        mb.sigt = eb.sigma_s
        mb.sige = eb.sigma_dp
        for f in self._BEAM_VARS:
            self._replace_var(madx, f, eb[f])
        for dim in ('x', 'y'):
            mb[f'e{dim}'] = eb[f'emit_{dim}']
            self._replace_var(
                madx, f'gamma_{dim}',
                '(1 + {} * {}) / {}'.format(
                    self._var_name(f'alpha_{dim}'),
                    self._var_name(f'alpha_{dim}'),
                    self._var_name(f'beta_{dim}'),
                ),
            )
        return madx

    def _fixup_element(self, element_in, element_out):
        super()._fixup_element(element_in, element_out)
        if self.from_class.sim_type() == SIM_TYPE:
            el = element_out
            op = '/'
        else:
            el = element_in
            op = '*'
        scale = self._FIELD_SCALE.get(el.type)
        if scale:
            for f in scale:
                if f in element_out:
                    element_out[f] = f'{element_out[f]} {op} {scale[f]}'

    def __normalize_elegant_beam(self, data, beam):
        # ensure p_central_mev, emit_x, emit_y, sigma_s, sigma_dp and dp_s_coupling are set
        # convert from other values if missing
        def _var(v):
            return self.vars.eval_var_with_assert(v)
        ers = LatticeUtil.find_first_command(data, 'run_setup')
        if not ers:
            return
        if not _var(ers.p_central_mev):
            #TODO(pjm): use particle mass, don't assume electron
            ers.p_central_mev = _var(ers.p_central) * _SCHEMA.constants.ELEGANT_ME_EV
        beam.p_central_mev = _var(ers.p_central_mev)
        beta_gamma = beam.p_central_mev / _SCHEMA.constants.ELEGANT_ME_EV
        for f in ('x', 'y'):
            emit = _var(beam[f'emit_{f}'])
            if not emit:
                # convert from normalized emittance
                emit = beam[f'emit_{f}'] = _var(beam[f'emit_n{f}']) / beta_gamma
        if str(data.models.bunch.longitudinalMethod) == '2':
            # convert alpha_z --> dp_s_coupling
            beam.dp_s_coupling = - _var(beam.alpha_z) / math.sqrt(1 + pow(_var(beam.alpha_z), 2))
        elif str(data.models.bunch.longitudinalMethod) == '3':
            # convert emit_z, beta_z, alpha_z --> sigma_s, sigma_dp, dp_s_coupling
            beam.sigma_s = math.sqrt(_var(beam.emit_z) * _var(beam.beta_z))
            gamma_z = (1 + _var(beam.alpha_z) ** 2) / _var(beam.beta_z)
            beam.sigma_dp = math.sqrt(_var(beam.emit_z) * gamma_z)
            beam.dp_s_coupling = - _var(beam.alpha_z) / math.sqrt(1 + pow(_var(beam.alpha_z), 2))
        if _var(beam.momentum_chirp):
            beam.sigma_dp = math.sqrt(_var(beam.sigma_dp) ** 2 + (_var(beam.sigma_s) * _var(beam.momentum_chirp)) ** 2)
            #TODO(pjm): determine conversion from momentum_chirp to db_s_coupling


def background_percent_complete(report, run_dir, is_running):

    def _percent(data, last_element, step):

        def _walk(beamline, index, elements, beamlines, beamline_map):
            # walk beamline in order, adding (<name>#<count> => index) to beamline_map
            for id in beamline['items']:
                if id in elements:
                    name = elements[id].name
                    if name not in beamline_map:
                        beamline_map[name] = 0
                    beamline_map[name] += 1
                    beamline_map['{}#{}'.format(name.upper(), beamline_map[name])] = index
                    index += 1
                else:
                    index = _walk(beamlines[abs(id)], index, elements, beamlines, beamline_map)
            return index

        if step > 1:
            cmd = LatticeUtil.find_first_command(data, 'run_control')
            if cmd and cmd.n_steps:
                n_steps = 0
                if code_variable.CodeVar.is_var_value(cmd.n_steps):
                    n_steps = code_var(data.models.rpnVariables).eval_var(cmd.n_steps)[0]
                else:
                    n_steps = int(cmd.n_steps)
                if n_steps and n_steps > 0:
                    return min(100, step * 100 / n_steps)
        if not last_element:
            return 0
        elements = PKDict()
        for e in data.models.elements:
            elements[e._id] = e
        beamlines = PKDict()
        for b in data.models.beamlines:
            beamlines[b.id] = b
        i = data.models.simulation.visualizationBeamlineId
        beamline_map = PKDict()
        count = _walk(beamlines[i], 1, elements, beamlines, beamline_map)
        index = beamline_map[last_element] if last_element in beamline_map else 0
        return min(100, index * 100 / count)

    #TODO(robnagler) remove duplication in run_dir.exists() (outer level?)
    alert, last_element, step = _parse_elegant_log(run_dir)
    res = PKDict(
        percentComplete=100,
        frameCount=0,
        alert=alert,
    )
    if is_running:
        data = simulation_db.read_json(run_dir.join(template_common.INPUT_BASE_NAME))
        res.percentComplete = _percent(data, last_element, step)
        return res
    if not run_dir.join(_ELEGANT_SEMAPHORE_FILE).exists():
        return res
    output_info = _output_info(run_dir)
    return res.pkupdate(
        frameCount=1,
        outputInfo=output_info,
        lastUpdateTime=output_info[0].lastUpdateTime,
    )


def code_var(variables):
    return elegant_lattice_importer.elegant_code_var(variables)


def copy_related_files(data, source_path, target_path):
    # copy results and log for the long-running simulations
    for m in ('animation',):
        # copy any simulation output
        s = pkio.py_path(source_path).join(m)
        if not s.exists():
            continue
        t = pkio.py_path(target_path).join(m)
        pkio.mkdir_parent(str(t))
        for f in pkio.sorted_glob('*'):
            f.copy(t)


def generate_parameters_file(data, is_parallel=False):
    return _Generate(data).sim(full=is_parallel)


def generate_variables(data):
    """Called by other templates"""
    def _gen(name, variables, visited):
        if name in visited:
            return ''
        visited[name] = True
        return f'% {_format_rpn_value(variables[name])} sto {name}\n'

    return code_var(data.models.rpnVariables).generate_variables(_gen, postfix=True)


def get_application_data(data, **kwargs):
    if data.method == 'get_beam_input_type':
        if data.input_file:
            data.input_type = _sdds_beam_type_from_file(
                _SIM_DATA.lib_file_abspath(data.input_file),
            )
        return data
    if code_var(data.variables).get_application_data(data, _SCHEMA):
        return data


def get_data_file(run_dir, model, frame, options=None, **kwargs):

    def _sdds(filename):
        path = run_dir.join(filename)
        assert path.check(file=True, exists=True), \
            '{}: not found'.format(path)
        if not options.suffix:
            return path
        if options.suffix != 'csv':
            raise AssertionError(
                f'invalid suffix={options.suffix} for download path={path}'
            )
        out = elegant_common.subprocess_output(
            ['sddsprintout', '-columns', '-spreadsheet=csv', str(path)],
        )
        assert out, \
            f'{path}: invalid or empty output from sddsprintout'
        return PKDict(
            uri=path.purebasename + '.csv',
            content=out,
        )

    if frame >= 0:
        data = simulation_db.read_json(run_dir.join(template_common.INPUT_BASE_NAME))
        # ex. elementAnimation17-55
        i = LatticeUtil.file_id_from_output_model_name(model)
        return _sdds(_get_filename_for_element_id(i, data))
    if model == 'animation':
        return template_common.text_data_file(ELEGANT_LOG_FILE, run_dir)
    return _sdds(_report_output_filename('bunchReport'))


def import_file(req, test_data=None, **kwargs):
    # input_data is passed by test cases only
    d = test_data
    if 'id' in req:
        d = simulation_db.read_simulation_json(SIM_TYPE, sid=req.id)
    p = pkio.py_path(req.filename)
    res = parse_input_text(
        p,
        pkcompat.from_bytes(req.file_stream.read()),
        d,
    )
    res.models.simulation.name = p.purebasename
    if d and not test_data:
        simulation_db.delete_simulation(
            SIM_TYPE,
            d.models.simulation.simulationId,
        )
    return res


def parse_input_text(path, text=None, input_data=None, update_filenames=True):

    def _map(data):
        for cmd in data.models.commands:
            if cmd._type == 'run_setup':
                cmd.lattice = 'Lattice'
                break
        for cmd in data.models.commands:
            if cmd._type == 'run_setup':
                name = cmd.use_beamline.upper()
                for bl in data.models.beamlines:
                    if bl.name.upper() == name:
                        cmd.use_beamline = bl.id
                        break

    if text is None:
        text = pkio.read_text(path)
    e = path.ext.lower()
    if e == '.ele':
        return elegant_command_importer.import_file(text, update_filenames)
    if e == '.lte':
        data = elegant_lattice_importer.import_file(text, input_data, update_filenames)
        if input_data:
            _map(data)
        return data
    if e == '.madx':
        return ElegantMadxConverter().from_madx_text(text)
    raise IOError(f'{path.basename}: invalid file format; expecting .madx, .ele, or .lte')


def prepare_for_client(data):
    code_var(data.models.rpnVariables).compute_cache(data, _SCHEMA)
    return data


def post_execution_processing(success_exit=True, run_dir=None, **kwargs):
    if success_exit:
        return None
    return _parse_elegant_log(run_dir)[0]


def prepare_sequential_output_file(run_dir, data):
    if data.report == 'twissReport' or 'bunchReport' in data.report:
        fn = simulation_db.json_filename(template_common.OUTPUT_BASE_NAME, run_dir)
        if fn.exists():
            fn.remove()
            output_file = run_dir.join(_report_output_filename(data.report))
            if output_file.exists():
                save_sequential_report_data(data, run_dir)


def python_source_for_model(data, model):
    if model == 'madx':
        return ElegantMadxConverter().to_madx_text(data)
    return generate_parameters_file(data, is_parallel=True) + '''
with open('elegant.lte', 'w') as f:
    f.write(lattice_file)

with open('elegant.ele', 'w') as f:
    f.write(elegant_file)

import os
os.system('elegant elegant.ele')
'''


def remove_last_frame(run_dir):
    pass


def rcscon_generate_lattice(data):
    return _Generate(data, validate=False).sim()


def save_sequential_report_data(data, run_dir):
    a = copy.deepcopy(data.models[data.report])
    a.frameReport = data.report
    if a.frameReport == 'twissReport':
        a.x = 's'
        a.y = a.y1
    a.frameIndex = 0
    template_common.write_sequential_result(
        _extract_report_data(str(run_dir.join(_report_output_filename(a.frameReport))), a),
        run_dir=run_dir,
    )


def sim_frame(frame_args):

    def _id(file_id, model_data, run_dir):
        return str(run_dir.join(
            _get_filename_for_element_id(file_id, model_data)))

    r = frame_args.frameReport
    page_count = 0
    for info in _output_info(frame_args.run_dir):
        if info.modelKey == r:
            page_count = info.pageCount
            frame_args.fieldRange = info.fieldRange
    frame_args.y = frame_args.y1
    return _extract_report_data(
        _id(
            frame_args.xFileId,
            frame_args.sim_in,
            frame_args.run_dir,
        ),
        frame_args,
        page_count=page_count,
    )


def validate_file(file_type, path):
    err = None
    if file_type == 'bunchFile-sourceFile':
        _sdds_init()
        err = 'expecting sdds file with (x, xp, y, yp, t, p) or (r, pr, pz, t, pphi) columns'
        if sdds.sddsdata.InitializeInput(_SDDS_INDEX, str(path)) == 1:
            beam_type = _sdds_beam_type(sdds.sddsdata.GetColumnNames(_SDDS_INDEX))
            if beam_type in ('elegant', 'spiffe'):
                sdds.sddsdata.ReadPage(_SDDS_INDEX)
                if len(sdds.sddsdata.GetColumn(_SDDS_INDEX, 0)) > 0:
                    err = None
                else:
                    err = 'sdds file contains no rows'
        sdds.sddsdata.Terminate(_SDDS_INDEX)
    return err


def webcon_generate_lattice(data):
    return _Generate(data, validate=False).lattice_only()


def write_parameters(data, run_dir, is_parallel):
    """Write the parameters file

    Args:
        data (dict): input
        run_dir (py.path): where to write
        is_parallel (bool): run in background?
    """
    pkio.write_text(
        run_dir.join(template_common.PARAMETERS_PYTHON_FILE),
        generate_parameters_file(
            data,
            is_parallel,
        ),
    )
    for b in _SIM_DATA.lib_file_basenames(data):
        if re.search(r'SCRIPT-commandFile', b):
            os.chmod(str(run_dir.join(b)), stat.S_IRUSR | stat.S_IXUSR)


class _Generate(sirepo.lib.GenerateBase):

    def __init__(self, data, validate=True, update_output_filenames=True):
        self.data = data
        self._filename_map = None
        self._schema = _SCHEMA
        self._update_output_filenames = update_output_filenames
        if validate:
            self._validate_data()

    @property
    def filename_map(self):
        if not self._filename_map:
            self._filename_map = _build_filename_map_from_util(
                self.util,
                self._update_output_filenames,
            )
        return self._filename_map

    def lattice_only(self):
        return self._lattice()

    def sim(self, full=True):
        d = self.data
        r, v = template_common.generate_parameters_file(d)
        v.rpn_variables = generate_variables(d)
        self.jinja_env = v
        if full:
            return r + self._full_simulation()
        if d.get('report', '') == 'twissReport':
            return r + self._twiss_simulation()
        return r + self._bunch_simulation()

    def _abspath(self, basename):
        return _SIM_DATA.lib_file_abspath(basename)

    def _bunch_simulation(self):
        d = self.data
        v = self.jinja_env
        for f in _SCHEMA.model.bunch:
            info = _SCHEMA.model.bunch[f]
            if info[1] == 'RPNValue':
                field = f'bunch_{f}'
                v[field] = _format_rpn_value(v[field], is_command=True)
        longitudinal_method = int(d.models.bunch.longitudinalMethod)
        # sigma s, sigma dp, dp s coupling
        if longitudinal_method == 1:
            v.update(
                bunch_emit_z=0,
                bunch_beta_z=0,
                bunch_alpha_z=0,
            )
        # sigma s, sigma dp, alpha z
        elif longitudinal_method == 2:
            v.update(
                bunch_emit_z=0,
                bunch_beta_z=0,
                bunch_dp_s_coupling=0,
            )
        # emit z, beta z, alpha z
        elif longitudinal_method == 3:
            v.update(
                bunch_sigma_dp=0,
                bunch_sigma_s=0,
                bunch_dp_s_coupling=0,
            )
        if d.models.bunchSource.inputSource == 'sdds_beam':
            v.update(
                bunch_beta_x=5,
                bunch_beta_y=5,
                bunch_alpha_x=0,
            )
            if v.bunchFile_sourceFile and v.bunchFile_sourceFile != 'None':
                v.bunchInputFile = self._input_file(
                    'bunchFile',
                    'sourceFile',
                    v.bunchFile_sourceFile,
                )
                v.bunchFileType = _sdds_beam_type_from_file(
                    self._abspath(v.bunchInputFile),
                )
        if str(d.models.bunch.p_central_mev) == '0':
            run_setup = LatticeUtil.find_first_command(d, 'run_setup')
            if run_setup and run_setup.expand_for:
                v.bunchExpandForFile = 'expand_for = "{}",'.format(
                    self._input_file(
                        'command_run_setup',
                        'expand_for',
                        run_setup.expand_for,
                    ),
                )
        v.bunchOutputFile = _report_output_filename('bunchReport')
        return template_common.render_jinja(SIM_TYPE, v, 'bunch.py')

    def _commands(self):
        commands = self.util.iterate_models(
            CommandIterator(self.filename_map, self._format_field_value),
            'commands',
        ).result
        res = ''
        for c in commands:
            res +=  '\n' + '&{}'.format(c[0]._type) + '\n'
            for f in c[1]:
                res += '  {} = {},'.format(f[0], f[1]) + '\n'
            res += '&end' + '\n'
        return res

    def _format_field_value(self, state, model, field, el_type):

        def _num(el_type, value):
            return el_type in ('RPNValue', 'RPNBoolean', 'Integer', 'Float') \
                and re.search(r'^[\-\+0-9eE\.]+$', str(value))

        value = model[field]
        if el_type.endswith('StringArray'):
            return ['{}[0]'.format(field), value]
        if el_type == 'RPNValue':
            value = _format_rpn_value(value, is_command=LatticeUtil.is_command(model))
        elif el_type == 'OutputFile':
            value = state.filename_map[LatticeUtil.file_id(model._id, state.field_index)]
        elif el_type.startswith('InputFile'):
            value = self._input_file(LatticeUtil.model_name_for_data(model), field, value)
            if el_type == 'InputFileXY':
                value += '={}+{}'.format(model[field + 'X'], model[field + 'Y'])
        elif el_type == 'BeamInputFile':
            value = self._input_file('bunchFile', 'sourceFile', value)
        elif el_type == 'LatticeBeamlineList':
            value = state.id_map[int(value)].name
        elif el_type == 'ElegantLatticeList':
            value = self._lattice_filename(value)
        elif field == 'command' and LatticeUtil.model_name_for_data(model) == 'SCRIPT':
            for f in ('commandFile', 'commandInputFile'):
                if f in model and model[f]:
                    fn = self._input_file(model.type, f, model[f])
                    value = re.sub(r'\b' + re.escape(model[f]) + r'\b', fn, value)
            if model.commandFile:
                value = './' + value
        if not _num(el_type, value):
            value = '"{}"'.format(value)
        return [field, value]

    def _full_simulation(self):
        def _escape(v):
            return re.sub(r'\\', r'\\\\', v)

        d = self.data
        if not LatticeUtil.find_first_command(d, 'global_settings'):
            d.models.commands.insert(
                0,
                PKDict(
                    _id=LatticeUtil.max_id(d) + 1,
                    _type='global_settings',
                ),
            )
        self.jinja_env.update(
            commands=_escape(self._commands()),
            lattice=_escape(self._lattice()),
            simulationMode=d.models.simulation.simulationMode,
        )
        return template_common.render_jinja(SIM_TYPE, self.jinja_env)

    def _input_file(self, model_name, field, filename):
        return _SIM_DATA.lib_file_name_with_model_field(
            model_name,
            field,
            filename,
        )

    def _lattice(self):
        return self.util.render_lattice_and_beamline(
            lattice.LatticeIterator(self.filename_map, self._format_field_value),
            quote_name=True,
        )

    def _lattice_filename(self, value):
        if value and value == 'Lattice':
            return 'elegant.lte'
        return value + '.filename.lte'

    def _twiss_simulation(self):
        d = self.data
        max_id = LatticeUtil.max_id(d)
        sim = d.models.simulation
        sim.simulationMode = 'serial'
        run_setup = LatticeUtil.find_first_command(d, 'run_setup') or PKDict(
            _id=max_id + 1,
            _type='run_setup',
            lattice='Lattice',
            p_central_mev=d.models.bunch.p_central_mev,
        )
        run_setup.use_beamline = sim.activeBeamlineId
        run_setup.always_change_p0 = '0'
        twiss_output = LatticeUtil.find_first_command(d, 'twiss_output') or PKDict(
            _id=max_id + 2,
            _type='twiss_output',
            filename='1',
        )
        twiss_output.final_values_only = '0'
        twiss_output.output_at_each_step = '0'
        change_particle = LatticeUtil.find_first_command(d, 'change_particle')
        d.models.commands = [
            run_setup,
            twiss_output,
        ]
        if change_particle:
            d.models.commands.insert(0, change_particle)
        return self._full_simulation()

    def _validate_data(self):

        def _fix(m):
            """the halo(gaussian) value will get validated/escaped to halogaussian, change it back"""
            if 'distribution_type' in m and 'halogaussian' in m.distribution_type:
                m.distribution_type = m.distribution_type.replace('halogaussian', 'halo(gaussian)')

        enum_info = template_common.validate_models(self.data, _SCHEMA)
        _fix(self.data.models.bunch)
        for t in ['elements', 'commands']:
            for m in self.data.models[t]:
                template_common.validate_model(
                    m,
                    _SCHEMA.model[LatticeUtil.model_name_for_data(m)],
                    enum_info,
                )
                _fix(m)


def _build_filename_map(data):
    return _build_filename_map_from_util(LatticeUtil(data, _SCHEMA))


def _build_filename_map_from_util(util, update_filenames=True):
    return util.iterate_models(OutputFileIterator(update_filenames)).result


def _extract_report_data(xFilename, frame_args, page_count=0):

    def _label(field, units):
        if field in _FIELD_LABEL:
            return _FIELD_LABEL[field]
        if units in _SIMPLE_UNITS:
            return '{} [{}]'.format(field, units)
        return field

    def _title(xfield, yfield, page_index, page_count):
        title_key = xfield + '-' + yfield
        title = ''
        if title_key in _PLOT_TITLE:
            title = _PLOT_TITLE[title_key]
        else:
            title = '{} / {}'.format(xfield, yfield)
        if page_count > 1:
            title += ', Plot {} of {}'.format(page_index + 1, page_count)
        return title

    _sdds_init()
    page_index = frame_args.frameIndex
    xfield = frame_args.x if 'x' in frame_args else frame_args[_X_FIELD]
    # x, column_names, x_def, err
    x_col = sdds_util.extract_sdds_column(xFilename, xfield, page_index)
    if x_col['err']:
        return x_col['err']
    x = x_col['values']
    if not _is_histogram_file(xFilename, x_col['column_names']):
        # parameter plot
        plots = []
        filename = PKDict(
            y1=xFilename,
            #TODO(pjm): y2Filename, y3Filename are not currently used. Would require rescaling x value across files.
            y2=xFilename,
            y3=xFilename,
        )
        for f in ('y1', 'y2', 'y3'):
            if re.search(r'^none$', frame_args[f], re.IGNORECASE) or frame_args[f] == ' ':
                continue
            yfield = frame_args[f]
            y_col = sdds_util.extract_sdds_column(filename[f], yfield, page_index)
            if y_col['err']:
                return y_col['err']
            y = y_col['values']
            plots.append(PKDict(
                field=yfield,
                points=y,
                label=_label(yfield, y_col['column_def'][1]),
            ))
        title = ''
        if page_count > 1:
            title = 'Plot {} of {}'.format(page_index + 1, page_count)
        return template_common.parameter_plot(x, plots, frame_args, PKDict(
            title=title,
            y_label='',
            x_label=_label(xfield, x_col['column_def'][1]),
        ))
    yfield = frame_args['y1'] if 'y1' in frame_args else frame_args['y']
    y_col = sdds_util.extract_sdds_column(xFilename, yfield, page_index)
    if y_col['err']:
        return y_col['err']
    return template_common.heatmap([x, y_col['values']], frame_args, PKDict(
        x_label=_label(xfield, x_col['column_def'][1]),
        y_label=_label(yfield, y_col['column_def'][1]),
        title=_title(xfield, yfield, page_index, page_count),
    ))


def _format_rpn_value(value, is_command=False):
    if code_variable.CodeVar.is_var_value(value):
        value = code_variable.CodeVar.infix_to_postfix(value)
        if is_command:
            return '({})'.format(value)
    return value


def _get_filename_for_element_id(file_id, data):
    return _build_filename_map(data)[file_id]


def _is_histogram_file(filename, columns):
    filename = os.path.basename(filename)
    if re.search(r'^closed_orbit.output', filename):
        return False
    if 'xFrequency' in columns and 'yFrequency' in columns:
        return False
    if ('x' in columns and 'xp' in columns) \
       or ('y' in columns and 'yp' in columns) \
       or ('t' in columns and 'p' in columns):
        return True
    return False


def _output_info(run_dir):

    def _info(filename, run_dir, file_id):

        def _defs(parameters):
            """Convert parameters to useful definitions"""
            return PKDict({
                p: PKDict(
                    zip(
                        ['symbol', 'units', 'description', 'format_string', 'type', 'fixed_value'],
                        sdds.sddsdata.GetParameterDefinition(_SDDS_INDEX, p),
                    ),
                ) for p in parameters
            })

        def _fix(v):
            if isinstance(v, float) and (math.isinf(v) or math.isnan(v)):
                return 0
            return v

        file_path = run_dir.join(filename)
        if not re.search(r'.sdds$', filename, re.IGNORECASE):
            if file_path.exists():
                return PKDict(
                    isAuxFile=True,
                    filename=filename,
                    id=file_id,
                    lastUpdateTime=int(os.path.getmtime(str(file_path))),
                )
            return None
        try:
            if sdds.sddsdata.InitializeInput(_SDDS_INDEX, str(file_path)) != 1:
                return None
            column_names = sdds.sddsdata.GetColumnNames(_SDDS_INDEX)
            plottable_columns = []
            double_column_count = 0
            field_range = PKDict()
            for col in column_names:
                col_type = sdds.sddsdata.GetColumnDefinition(_SDDS_INDEX, col)[4]
                if col_type < _SDDS_STRING_TYPE:
                    plottable_columns.append(col)
                if col_type in _SDDS_DOUBLE_TYPES:
                    double_column_count += 1
                field_range[col] = []
            parameter_names = sdds.sddsdata.GetParameterNames(_SDDS_INDEX)
            parameters = PKDict([(p, []) for p in parameter_names])
            page_count = 0
            row_counts = []
            while True:
                if sdds.sddsdata.ReadPage(_SDDS_INDEX) <= 0:
                    break
                row_counts.append(sdds.sddsdata.RowCount(_SDDS_INDEX))
                page_count += 1
                for i, p in enumerate(parameter_names):
                    parameters[p].append(_fix(sdds.sddsdata.GetParameter(_SDDS_INDEX, i)))
                for col in column_names:
                    try:
                        values = sdds.sddsdata.GetColumn(
                            _SDDS_INDEX,
                            column_names.index(col),
                        )
                    except SystemError:
                        # incorrectly generated sdds file
                        break
                    if not values:
                        pass
                    elif field_range[col]:
                        field_range[col][0] = min(_fix(min(values)), field_range[col][0])
                        field_range[col][1] = max(_fix(max(values)), field_range[col][1])
                    else:
                        field_range[col] = [_fix(min(values)), _fix(max(values))]
            return PKDict(
                isAuxFile=False if double_column_count > 1 else True,
                filename=filename,
                id=file_id,
                rowCounts=row_counts,
                pageCount=page_count,
                columns=column_names,
                parameters=parameters,
                parameterDefinitions=_defs(parameters),
                plottableColumns=plottable_columns,
                lastUpdateTime=int(os.path.getmtime(str(file_path))),
                isHistogram=_is_histogram_file(filename, column_names),
                fieldRange=field_range,
            )
        finally:
            try:
                sdds.sddsdata.Terminate(_SDDS_INDEX)
            except Exception:
                pass

    # cache outputInfo to file, used later for report frames
    info_file = run_dir.join(_OUTPUT_INFO_FILE)
    if os.path.isfile(str(info_file)):
        try:
            res = simulation_db.read_json(info_file)
            if not res or res[0].get('_version', '') == _OUTPUT_INFO_VERSION:
                return res
        except ValueError as e:
            pass
    _sdds_init()
    data = simulation_db.read_json(run_dir.join(template_common.INPUT_BASE_NAME))
    res = []
    filename_map = _build_filename_map(data)
    for k in filename_map.keys_in_order:
        filename = filename_map[k]
        info = _info(filename, run_dir, k)
        if info:
            info.modelKey = LatticeUtil.output_model_name(info.id)
            res.append(info)
    if res:
        res[0]['_version'] = _OUTPUT_INFO_VERSION
    simulation_db.write_json(info_file, res)
    return res


def _parse_elegant_log(run_dir):
    path = run_dir.join(ELEGANT_LOG_FILE)
    if not path.exists():
        return '', 0, 0
    res = ''
    last_element = None
    text = pkio.read_text(str(path))
    want_next_line = False
    prev_line = ''
    prev_err = ''
    step = 0
    for line in text.split('\n'):
        if line == prev_line:
            continue
        match = re.search(r'^Starting (\S+) at s=', line)
        if match:
            name = match.group(1)
            if not re.search(r'^M\d+\#', name):
                last_element = name
        match = re.search(r'^tracking step (\d+)', line)
        if match:
            step = int(match.group(1))
        if want_next_line:
            res += line + '\n'
            want_next_line = False
        elif _ERROR_IGNORE_RE.search(line):
            pass
        elif _ERROR_RE.search(line):
            if len(line) < 10:
                want_next_line = True
            else:
                if line != prev_err:
                    res += line + '\n'
                prev_err = line
        prev_line = line
    return res, last_element, step


def _report_output_filename(report):
    if report == 'twissReport':
        return 'twiss_output.filename.sdds'
    return 'elegant.bun'


def _sdds_beam_type(column_names):

    def _contains(column_names, search):
        for col in search:
            if col not in column_names:
                return False
        return True

    if _contains(column_names, ['x', 'xp', 'y', 'yp', 't', 'p']):
        return 'elegant'
    if _contains(column_names, ['r', 'pr', 'pz', 't', 'pphi']):
        return 'spiffe'
    return ''


def _sdds_beam_type_from_file(path):
    _sdds_init()
    res = ''
    if sdds.sddsdata.InitializeInput(_SDDS_INDEX, str(path)) == 1:
        res = _sdds_beam_type(sdds.sddsdata.GetColumnNames(_SDDS_INDEX))
    sdds.sddsdata.Terminate(_SDDS_INDEX)
    return res

def _sdds_init():
    global _SDDS_INDEX, _SDDS_DOUBLE_TYPES, _SDDS_STRING_TYPE, sdds_util, sdds
    if _SDDS_INDEX is not None:
        return
    from sirepo.template import sdds_util
    import sdds
    _SDDS_INDEX = 0
    _s = sdds.SDDS(_SDDS_INDEX)
    _x = getattr(_s, 'SDDS_LONGDOUBLE', None)
    _SDDS_DOUBLE_TYPES = [_s.SDDS_DOUBLE, _s.SDDS_FLOAT] + ([_x] if _x else [])
    _SDDS_STRING_TYPE = _s.SDDS_STRING
