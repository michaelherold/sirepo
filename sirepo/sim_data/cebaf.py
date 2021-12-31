# -*- coding: utf-8 -*-
u"""simulation data operations

:copyright: Copyright (c) 2020 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdlog, pkdp
from sirepo.template.lattice import LatticeUtil
from sirepo.template.template_common import ParticleEnergy
import sirepo.sim_data
import sirepo.simulation_db

class SimData(sirepo.sim_data.SimDataBase):

    @classmethod
    def _compute_model(cls, analysis_model, *args, **kwargs):
        if analysis_model == 'dataServerAnimation':
            return analysis_model
        return super(SimData, cls)._compute_model(analysis_model, *args, **kwargs)


    @classmethod
    def controls_madx_dir(cls):
        return sirepo.simulation_db.simulation_dir('madx')

    @classmethod
    def fixup_old_data(cls, data):
        dm = data.models
        cls._init_models(
            dm,
            (
                'dataFile',
                'mlModelConfig',
            ),
        )
        if 'externalLattice' in dm:
            sirepo.sim_data.get_class('madx').fixup_old_data(dm.externalLattice)

    @classmethod
    def _compute_job_fields(cls, data, r, compute_model):
        res = []
        return res

    @classmethod
    def _lib_file_basenames(cls, data):
        return []
