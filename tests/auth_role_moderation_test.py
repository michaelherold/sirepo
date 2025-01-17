# -*- coding: utf-8 -*-
"""test moderated sim types

:copyright: Copyright (c) 2019 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern.pkcollections import PKDict
import getpass
import os
import pytest


def setup_module(module):
    os.environ.update(
        SIREPO_FEATURE_CONFIG_MODERATED_SIM_TYPES="myapp",
        SIREPO_AUTH_ROLE_MODERATION_MODERATOR_EMAIL=getpass.getuser()
        + "@localhost.localdomain",
    )


def test_moderation(auth_fc):
    from pykern import pkunit
    from sirepo import srunit
    import sirepo.auth_db
    import sirepo.pkcli.roles

    fc = auth_fc
    fc.sr_email_register("x@x.x", sim_type="srw")
    fc.sr_sim_type = "myapp"
    with srunit.quest_start():
        sirepo.auth_db.UserRole.delete_all()
        sirepo.auth_db.UserRoleInvite.delete_all()
    with pkunit.pkexcept("SRException.*moderationRequest"):
        fc.sr_sim_data()
    fc.sr_post(
        "saveModerationReason",
        PKDict(
            simulationType=fc.sr_sim_type,
            reason="reason for needing moderation",
        ),
    )
    r = fc.sr_post(
        "getModerationRequestRows",
        PKDict(),
        raw_response=True,
    )
    pkunit.pkeq(403, r.status_code)
    sirepo.pkcli.roles.add_roles(
        fc.sr_auth_state().uid,
        sirepo.auth_role.ROLE_ADM,
    )
    r = fc.sr_post(
        "getModerationRequestRows",
        PKDict(),
    )
    pkunit.pkeq(len(r.rows), 1)
    fc.sr_post(
        "admModerate",
        PKDict(
            token=r.rows[0].token,
            status="approve",
        ),
    )
    r = fc.sr_sim_data()
    pkunit.pkok(r.get("models"), "no models r={}", r)


def test_no_guest(fc):
    from pykern import pkunit
    from pykern.pkdebug import pkdp
    from pykern.pkcollections import PKDict

    fc.sr_login_as_guest(sim_type="srw")
    r = fc.sr_post(
        "saveModerationReason",
        PKDict(
            simulationType="myapp",
            reason="reason for needing moderation",
        ),
        raw_response=True,
    )
    pkunit.pkeq(403, r.status_code)
