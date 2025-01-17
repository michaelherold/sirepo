# -*- coding: utf-8 -*-
"""initialize modules based on mode

:copyright: Copyright (c) 2022 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdlog, pkdp
import importlib


def import_and_init(name):
    values = PKDict(want_flask=name == "sirepo.server")

    def _base(qual):
        return qual.split(".")[-1]

    def _i(to_import, kw):
        pkdc("{}", to_import)
        m = importlib.import_module(to_import)
        m.init_module(**{k: values[k] for k in kw})
        values[_base(to_import)] = m
        return m

    _i("sirepo.srtime", [])
    _i("sirepo.flask", ["want_flask"])
    _i("sirepo.job", [])
    # Not a real initialization, but needed in values, and actually makes sense to do
    _i("sirepo.simulation_db", [])
    _i("sirepo.auth_db", [])
    _i("sirepo.session", [])
    _i("sirepo.cookie", [])
    _i("sirepo.auth", ["simulation_db"])
    m = _i("sirepo.uri_router", ["simulation_db"])
    if "sirepo.uri_router" == name:
        # Used by server so rest everything should already be initialized
        return m
    m = _i("sirepo.uri", ["simulation_db", "uri_router"])
    _i("sirepo.http_request", ["simulation_db"])
    _i("sirepo.http_reply", ["simulation_db"])
    _i("sirepo.uri", ["simulation_db", "uri_router"])
    _i("sirepo.quest", ["http_reply", "http_request", "uri_router"])
    if name in ("sirepo.auth", "sirepo.uri"):
        return values[_base(name)]
    if "sirepo.server" == name:
        return _i("sirepo.server", [])
    if "sirepo.job_supervisor" == name:
        # job_supervisor doesn't need job_driver in its init so hack this
        values.job_driver = importlib.import_module("sirepo.job_driver")
        _i("sirepo.job_supervisor", ["job_driver"])
        _i("sirepo.job_driver", ["job_supervisor"])
        return values[_base(name)]
    raise AssertionError(f"unsupported module={name}")
