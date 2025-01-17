# -*- coding: utf-8 -*-
"""HTTP Basic Auth Login

:copyright: Copyright (c) 2019 Bivio Software, Inc.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern.pkdebug import pkdc, pkdlog, pkdp
from pykern import pkconfig


AUTH_METHOD = "basic"

#: bots only
AUTH_METHOD_VISIBLE = False


def init_apis(*args, **kwargs):
    global cfg
    cfg = pkconfig.init(
        uid=pkconfig.Required(_cfg_uid, "single user allowed to login with basic auth"),
        password=pkconfig.Required(str, "password for uid"),
    )


def require_user(qcall):
    """Check for basic auth credentials against cfg"""
    v = qcall.sreq.get("http_authorization")
    if v and v.type == "basic" and cfg.uid == v.username and cfg.password == v.password:
        return cfg.uid
    return None


def _cfg_uid(value):
    from sirepo import simulation_db

    if value and value == "dev-no-validate" and pkconfig.channel_in_internal_test():
        return value
    assert simulation_db.user_path(value).check(
        dir=True
    ), "uid={} does not exist".format(value)
    return value
