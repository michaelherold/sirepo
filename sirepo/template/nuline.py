# -*- coding: utf-8 -*-
u"""Controls execution template.

:copyright: Copyright (c) 2020 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function

import zipfile

from pykern import pkio
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdp
from sirepo.template import template_common
import csv
import numpy
import re
import sirepo.sim_data
import sirepo.simulation_db
import sirepo.util

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


def extract_report_data(run_dir, sim_in):
    template_common.write_sequential_result(
        _REPORTS[sim_in.report](sim_in)
    )


def get_application_data(data, **kwargs):
    return globals()[data.method](data)


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


def _lib_file_path(data):
    return sirepo.simulation_db.simulation_lib_dir(SIM_TYPE).join(
        _SIM_DATA.lib_file_name_with_model_field(data.model, data.field, data.filename)
    )


def _get_image(data):
    with zipfile.ZipFile(_lib_file_path(data), 'r') as z:
        dp = [p for p in z.namelist() if data.path == pkio.py_path(p).purebasename][0]
        return z.read(dp)


def _get_settings(data):
    #import base64
    #import mimetypes
    from pykern import pkcompat

    f = _lib_file_path(data)
    with zipfile.ZipFile(f, 'r') as z:
        txt = pkcompat.from_bytes(z.read(data.path)).splitlines()
        image_name, header, header_index = _process_header(
            txt,
            data.image_name_in_header,
            data.filename
        )
        # Returning the raw data can be useful for troubleshooting
        #dp = [p for p in z.namelist() if image_name == pkio.py_path(p).purebasename][0]
        # Note: do not use urlsafe_b64encode()
        #src = pkcompat.from_bytes(base64.b64encode(z.read(dp)))

    s = [float(x) for x in txt[header_index + 1].split()]
    return PKDict(
        settings=[PKDict(name=n, value=s[i]) for i, n in enumerate(header)],
        imageFile=image_name,
        #imageType=mimetypes.guess_type(dp)[0],
        #imageSource=src
    )


def _process_zip_file(data):

    if not data.filename:
        return PKDict()
    f = _lib_file_path(data)
    sirepo.util.validate_safe_zip(f)
    d = {}
    with zipfile.ZipFile(f, 'r') as z:
        dp = [p for p in z.namelist() if 'Datafiles' in p and not z.getinfo(p).is_dir()]
        df = [pkio.py_path(p).basename for p in dp]
        d = {k: dp[i] for i, k in enumerate(df)}

    return PKDict(d)


def _get_image_name_from_tag(line):
    # line is of the form '# scan_title = <image file name> <optional comment>'
    return re.split(
        r'\s+',
        re.split(r'\s*=\s*', line)[1]
    )[0]


def _process_header(lines, image_name_in_header, file_name):
    image_name = None
    header = ''
    column_header_index = 0
    for i, l in enumerate(lines):
        if image_name_in_header and _IMAGE_TAG in l:
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


def _extract_beamline_image_report(data):
    import PIL.Image
    import io

    img_bytes = _get_image(PKDict(
        model='beamlineDataFile',
        field='dataFile',
        filename=data.models.beamlineDataFile.dataFile,
        path=data.models.beamlineImageReport.imageFile
    ))
    img = PIL.Image.open(io.BytesIO(img_bytes))
    img_data = numpy.array(img)

    intensity = []
    max_intensity = 256 * 256 * 255 + 256 * 255 + 255
    for x in img_data:
        row = []
        for y in x:
            row.append((256 * 256 * int(y[0]) + 256 * int(y[1]) + int(y[2])) / max_intensity)
        intensity.append(row)

    title = data.models.beamlineImageReport.imageFile

    return PKDict(
        aspectRatio=img.size[1] / img.size[0],
        preserve_y=True,
        x_range=[0, img.size[0], img.size[0]],
        y_range=[0, img.size[1], img.size[1]],
        x_label='x',
        y_label='y',
        z_label='Intensity',
        title=title,
        z_matrix=intensity,
        z_range=[0, int(numpy.max(intensity))],
        summaryData=PKDict(
            x_range=[0, img.size[0], img.size[0]],
            y_range=[0, img.size[1], img.size[1]],
            sample={
                '90': [
                    [300, 200], [320, 210], [340, 200], [340, 175], [330, 125], [300, 125], [300, 200]
                ],
                '70': [
                    [290, 220], [350, 215], [345, 115], [285, 115], [290, 220]
                ],
                '66': [
                    [275, 230], [360, 230], [360, 100], [275, 100], [275, 230]
                ]
            }
        ),
    )


def _generate_parameters_file(data):
    res, v = template_common.generate_parameters_file(data)
    #v.optimizerTargets = data.models.optimizerSettings.targets
    #v.summaryCSV = _SUMMARY_CSV_FILE
    #if data.get('report') == 'initialMonitorPositionsReport':
    #    v.optimizerSettings_method = 'runOnce'
    #return res + template_common.render_jinja(SIM_TYPE, v)
    return res


_REPORTS = PKDict(
    beamlineImageReport=_extract_beamline_image_report
)