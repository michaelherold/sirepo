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
    pkdp('GET APP DATA {}', data)
    if data.method != 'process_data_file':
        return PKDict()
    return process_data_file(data.filename, True)


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


def stateless_compute_process_data_file(data):
    return process_data_file(data.filename, True)


def process_data_file(filename, image_name_in_header):
    p = _SIM_DATA.lib_file_abspath(
        _SIM_DATA.lib_file_name_with_model_field('simulation', 'dataFile', filename)
    )
    with open(p, 'r') as ff:
        image_name, header, header_index = _process_header(ff, image_name_in_header)

    array_data = _get_array(p, header, header_index).reshape(1, )

    return PKDict(
        header=header,
        img=image_name,
        values=array_data.tolist()
    )


def _get_array(filename, header, header_index):
    arr_dtype = _construct_dtype(header)
    array_data = numpy.loadtxt(filename, dtype=arr_dtype, skiprows=header_index + 1)

    return array_data


def _construct_dtype(header):
    # First item will be comment character
    header_items = header.split()[1:]

    dtype = []
    for item in header_items:
        dtype.append((item, float))

    return dtype


def _get_image_name_from_tag(line):
    l, r = line.split('=')
    return r.strip()


def _get_image_name_from_filename(file):
    digits = re.findall(r'\d+', file.name)

    # int coversion removes leading 0s
    return _IMAGE_PREFIX + str(int(digits[-1]))


def _process_header(file_obj, image_name_in_header):
    image_name = None
    lines = file_obj.readlines()
    for i, ln in enumerate(lines):
        if image_name_in_header:
            if _IMAGE_TAG in ln:
                image_name = _get_image_name_from_tag(ln)
        if _COL_TAG in ln:
            column_header_index = i + 1
            header = lines[column_header_index]
            break

    if not image_name_in_header:
        image_name = _get_image_name_from_filename(file_obj)

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


