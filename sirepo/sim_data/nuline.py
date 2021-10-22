# -*- coding: utf-8 -*-
u"""simulation data operations

:copyright: Copyright (c) 2020 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdlog, pkdp
from sirepo.template.lattice import LatticeUtil
from sirepo.template.template_common import ParticleEnergy
import sirepo.sim_data
import sirepo.simulation_db

class SimData(sirepo.sim_data.SimDataBase):

    @classmethod
    def default_optimizer_settings(cls, madx):
        element_map = PKDict({e._id: e for e in madx.elements})
        targets = []
        for el_id in madx.beamlines[0]['items']:
            el = element_map[el_id]
            if el.type in ('MONITOR', 'HMONITOR', 'VMONITOR'):
                item = cls.model_defaults('optimizerTarget')
                item.name = el.name
                if el.type == 'HMONITOR':
                    del item['y']
                elif el.type == 'VMONITOR':
                    del item['x']
                targets.append(item)
        return cls.model_defaults('optimizerSettings').pkupdate(PKDict(
            targets=targets,
        ))

    @classmethod
    def fixup_old_data(cls, data):
        dm = data.models
        cls._init_models(
            dm,
        )

    @classmethod
    def _compute_job_fields(cls, data, r, compute_model):
        res = []
        return res

    @classmethod
    def _lib_file_basenames(cls, data):
        res = []
        r = data.get('report')
        res.append(cls.lib_file_name_with_model_field(
            'beamlineDataFile',
            'dataFile',
            data.models.beamlineDataFile.dataFile)
        )
        return res


