# -*- coding: utf-8 -*-
u"""Controls execution template.

:copyright: Copyright (c) 2020 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from pykern import pkio
from pykern import pkjson
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdp
from sirepo import util
from sirepo.template import template_common
from sirepo.template.lattice import LatticeUtil
import copy
import csv
import re
import sirepo.sim_data
import sirepo.simulation_db
import sirepo.template.madx

_SIM_DATA, SIM_TYPE, SCHEMA = sirepo.sim_data.template_globals()
_SUMMARY_CSV_FILE = 'summary.csv'

_MACHINE_DATA_FILE = 'machine_data.dat'


def background_percent_complete(report, run_dir, is_running):
    res = PKDict()
    try:
        res = pkjson.load_any(pkio.read_text(_MACHINE_DATA_FILE)).h[-1]
    except FileNotFoundError:
        pass
    if is_running:
        return PKDict(
            percentComplete=0,
            frameCount=0,
            res=res
        )
    return PKDict(
        percentComplete=100,
        frameCount=1,
        res=res
    )


def stateful_compute_get_madx_sim_list(data):
    res = []
    for f in pkio.sorted_glob(
        _SIM_DATA.controls_madx_dir().join(
            '*',
            sirepo.simulation_db.SIMULATION_DATA_FILE,
        ),
    ):
        m = sirepo.simulation_db.read_json(f).models
        res.append(PKDict(
            name=m.simulation.name,
            simulationId=m.simulation.simulationId,
            invalidMsg=None if _has_kickers(m) else 'No beamlines' if not _has_beamline(m) else 'No kickers'
        ))
    return PKDict(simList=res)


def stateful_compute_get_external_lattice(data):
    return _get_external_lattice(data.simulationId)


def stateless_compute_load_thresholds(data):
    return _load_thresholds(data)


def stateful_compute_get_readings(data):
    res = []
    item = data.mlModelConfigItems
    return PKDict(simList=res)


def _load_thresholds(data):
    import csv
    path = _SIM_DATA.lib_file_abspath(
        _SIM_DATA.lib_file_name_without_type(data.file)
    )
    rows = []
    with open(str(path)) as f:
        for row in csv.reader(f):
            rows.append(row)
    return PKDict(config=rows)


def python_source_for_model(data, model):
    return _generate_parameters_file(data)


def write_parameters(data, run_dir, is_parallel):
    pkio.write_text(
        run_dir.join(template_common.PARAMETERS_PYTHON_FILE),
        _generate_parameters_file(data),
    )


def _add_monitor(data):
    if list(filter(lambda el: el.type == 'MONITOR', data.models.elements)):
        return
    m = PKDict(
        _id=LatticeUtil.max_id(data) + 1,
        name='M_1',
        type='MONITOR',
    )
    data.models.elements.append(m)
    assert len(data.models.beamlines) == 1, \
        f'expecting 1 beamline={data.models.beamlines}'
    data.models.beamlines[0]['items'].append(m._id)


def _delete_unused_madx_commands(data):
    # remove all commands except first beam and twiss
    by_name = PKDict(
        beam=None,
        twiss=None,
    )
    for c in data.models.commands:
        if c._type in by_name and not by_name[c._type]:
            by_name[c._type] = c
    if by_name.twiss:
        by_name.twiss.sectorfile = '0'
        by_name.twiss.sectormap = '0'
        by_name.twiss.file = '1'
    data.models.bunch.beamDefinition = 'gamma'
    data.models.commands = [
        by_name.beam,
        PKDict(
            _id=LatticeUtil.max_id(data) + 1,
            _type='select',
            flag='twiss',
            column='name,keyword,s,x,y',
        ),
        by_name.twiss or PKDict(
            _id=LatticeUtil.max_id(data) + 2,
            _type='twiss',
            file='1',
        )
    ]


def _delete_unused_madx_models(data):
    for m in list(data.models.keys()):
        if m not in [
            'beamlines',
            'bunch',
            'commands',
            'elements',
            'report',
            'rpnVariables',
            'simulation',
        ]:
            data.models.pkdel(m)


def _settings_for_io(ml_cfg_items, io_type):
    return [i.setting.value for i in ml_cfg_items if i.io.value == io_type]


def _generate_parameters_file(data):
    res, v = template_common.generate_parameters_file(data)
    items = data.models.mlModelConfig.configItems
    v.ml_cfg_inputs = _settings_for_io(items, 'input')
    v.ml_cfg_outputs = _settings_for_io(items, 'output')
    v.ml_model = data.models.mlModelConfig
    v.machine_data_file = _MACHINE_DATA_FILE
    v.history_limit = data.models.mlModelConfig.sessionHistoryLimit
    return res + template_common.render_jinja(SIM_TYPE, v)


def _get_external_lattice(simulation_id):
    d = sirepo.simulation_db.read_json(
        _SIM_DATA.controls_madx_dir().join(
            simulation_id,
            sirepo.simulation_db.SIMULATION_DATA_FILE,
        ),
    )
    _delete_unused_madx_models(d)
    _delete_unused_madx_commands(d)
    sirepo.template.madx.uniquify_elements(d)
    _add_monitor(d)
    sirepo.template.madx.eval_code_var(d)
    return PKDict(
        externalLattice=d,
    )


def _has_beamline(model):
    return model.elements and model.beamlines


def _has_kickers(model):
    if not _has_beamline(model):
        return False
    k_ids = [e._id for e in model.elements if 'KICKER' in e.type]
    if not k_ids:
        return False
    for b in model.beamlines:
        if any([item in k_ids for item in b['items']]):
            return True
    return False


def _read_outputs():
    import random
    return [(1 + 0.1 * random.random()) for i in range(9)]
