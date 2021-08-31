# -*- coding: utf-8 -*-
u"""Controls execution template.

:copyright: Copyright (c) 2020 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkio
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdp
from sirepo.template import template_common
import csv
import numpy
import re
import sirepo.sim_data
import sirepo.simulation_db
import sirepo.template.madx

_SIM_DATA, SIM_TYPE, _SCHEMA = sirepo.sim_data.template_globals()
_SUMMARY_CSV_FILE = 'summary.csv'

_IMAGE_TAG = "scan_title"
_IMAGE_EXT = ".png"
_COL_TAG = "col_headers"
_DATAFILE_EXT = '.dat'
_IMAGE_ERROR_SIG = " - "
_IMAGE_PREFIX = 'exp739_IPTS_25282_scan'
_GET_APP_DATA_METHODS = ['process_data_file',]


def background_percent_complete(report, run_dir, is_running):
    if is_running:
        return PKDict(
            percentComplete=0,
            frameCount=0,
        )
    return PKDict(
        percentComplete=100,
        frameCount=1,
    )


def get_application_data(data, **kwargs):
    if data.method not in _GET_APP_DATA_METHODS:
        raise RuntimeError('method={}: unknown application data method'.format(data.method))
    if data.method != 'process_data_file':
        return PKDict()
    return process_data_file(data.filename, data.model, data.field, True)


def new_simulation(data, new_simulation_data):
    pass


def import_file(req, tmp_dir=None, **kwargs):
    data = sirepo.simulation_db.default_data(req.type)
    data.models.simulation.pkupdate(
        {k: v for k, v in req.req_data.items() if k in data.models.simulation}
    )
    #data.models.simulation.pkupdate(_parse_input_file_arg_str(req.import_file_arguments))
    return data


def python_source_for_model(data, model):
    return _generate_parameters_file(data)


def process_data_file(filename, model, field, image_name_in_header):
    txt = pkio.read_text(
        _SIM_DATA.lib_file_write_path(
            _SIM_DATA.lib_file_name_with_model_field(model, field, filename)
        )
    ).splitlines()
    image_name, header, header_index = _process_header(txt, image_name_in_header, filename)
    vals = [float(x) for x in txt[header_index + 1].split()]
    return PKDict(
        settings=[PKDict(name=n, value=vals[i]) for i, n in enumerate(header)],
        img=image_name,
    )


def _get_image_name_from_tag(line):
    l, r = line.split('=')
    return r.strip()


def _process_header(lines, image_name_in_header, file_name):
    image_name = None
    header = ''
    column_header_index = 0
    for i, l in enumerate(lines):
        if image_name_in_header:
            if _IMAGE_TAG in l:
                image_name = _get_image_name_from_tag(l)
        if _COL_TAG in l:
            column_header_index = i + 1
            header = [x for x in lines[column_header_index].split() if x != '#']
            break

    if not image_name_in_header:
        image_name = _IMAGE_PREFIX + str(int(re.findall(r'\d+', file_name)[-1]))

    return image_name, header, column_header_index


def write_parameters(data, run_dir, is_parallel):
    pkio.write_text(
        run_dir.join(template_common.PARAMETERS_PYTHON_FILE),
        _generate_parameters_file(data),
    )


def _generate_parameters_file(data):
    res, v = template_common.generate_parameters_file(data)
    v.optimizerTargets = data.models.optimizerSettings.targets
    v.summaryCSV = _SUMMARY_CSV_FILE
    if data.get('report') == 'initialMonitorPositionsReport':
        v.optimizerSettings_method = 'runOnce'
    return res + template_common.render_jinja(SIM_TYPE, v)


