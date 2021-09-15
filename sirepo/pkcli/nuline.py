# -*- coding: utf-8 -*-
"""Wrapper to run controls code from the command line.

:copyright: Copyright (c) 2020 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkio, pkjson
from pykern.pkcollections import PKDict
from sirepo.template import template_common
import sirepo.template.nuline as template
import py.path
from sirepo import simulation_db


def run(cfg_dir):
    template_common.exec_parameters()
    data = simulation_db.read_json(template_common.INPUT_BASE_NAME)
    template.extract_report_data(py.path.local(cfg_dir), data)


def run_background(cfg_dir):
    template_common.exec_parameters()
