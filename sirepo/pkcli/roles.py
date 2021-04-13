# -*- coding: utf-8 -*-
u"""CRUD operations for user roles

:copyright: Copyright (c) 2017 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdexc, pkdlog, pkdp
from sirepo.pkcli import admin
import pykern.pkcli
import sirepo.auth
import sirepo.auth_role
import sirepo.auth_db
import sirepo.server


def add(uid_or_email, *roles):
    """Assign roles to a user
    Args:
        uid_or_email (str): Uid or email of the user
        *roles: The roles to assign to the user
    """

    u = _parse_args(uid_or_email, roles)
    sirepo.auth_db.UserRole.add_roles(u, roles)


def add_roles(*args):
    """DEPRECATED: Use add"""
    add(*args)


def delete(uid_or_email, *roles):
    """Remove roles assigned to user
    Args:
        uid_or_email (str): Uid or email of the user
        *roles (args): The roles to delete
    """

    u = _parse_args(uid_or_email, roles)
    sirepo.auth_db.UserRole.delete_roles(u, roles)


def delete_roles(*args):
    """DEPRECATED: Use delete"""
    delete(*args)


def list(uid_or_email):
    """List all roles assigned to a user
    Args:
        uid_or_email (str): Uid or email of the user
    """

    u = _parse_args(uid_or_email, [])
    return sirepo.auth_db.UserRole.get_roles(u)


def list_roles(*args):
    """DEPRECATED: Use list"""
    return list(*args)



# TODO(e-carlin): This only works for email auth or using a uid
# doesn't work for other auth methods (ex GitHub)
def _parse_args(uid_or_email, roles):
    sirepo.server.init()

    # POSIT: Uid's are from the base62 charset so an '@' implies an email.
    if '@' in uid_or_email:
        u = sirepo.auth.get_module(
            'email',
        ).unchecked_user_by_user_name(uid_or_email)
    else:
        u = sirepo.auth.unchecked_get_user(uid_or_email)
    if not u:
        pykern.pkcli.command_error('uid_or_email={} not found', uid_or_email)
    if roles:
        a = sirepo.auth_role.get_all()
        assert set(roles).issubset(a), \
            'roles={} not a subset of all_roles={}'.format(roles, a)
    return u
