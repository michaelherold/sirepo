# -*- coding: utf-8 -*-
u"""Moderate user roles

:copyright: Copyright (c) 2018-2019 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from pykern import pkconfig
from pykern.pkdebug import pkdexc, pkdp, pkdlog
from pykern.pkcollections import PKDict
from pykern import pkjinja
import sirepo.api_perm
import sirepo.auth
import sirepo.auth_db
import sirepo.auth_role
import sirepo.feature_config
import sirepo.http_reply
import sirepo.http_request
import sirepo.request
import sirepo.simulation_db
import sirepo.smtp
import sirepo.uri
import sirepo.uri_router
import sqlalchemy

_STATUS_TO_SUBJECT = PKDict(
    approve='{} Access Request Approved',
    clarify='Sirepo {}: Additional Info?',
    deny='{} Access Request Denied',
)

_cfg = None


class Request(sirepo.request.Base):
    @sirepo.api_perm.require_adm
    def api_admModerate(self):

        def _send_moderation_status_email(info):
            sirepo.smtp.send(
                recipient=sirepo.auth.user_name(info.uid),
                subject=_STATUS_TO_SUBJECT[info.status].format(info.app_name),
                body=pkjinja.render_resource(
                    f'auth_role_moderation/{info.status}_email',
                    PKDict(
                        app_name=info.app_name,
                        display_name=info.display_name,
                        link=sirepo.uri.app_root(sirepo.auth_role.sim_type(info.role), external=True)
                    ),
                ),
            )

        def _set_moderation_status(info):
            if info.status == 'approve':
                sirepo.auth_db.UserRole.add_roles(info.uid, [info.role])
            sirepo.auth_db.UserRoleInvite.set_status(
                info.uid,
                info.role,
                info.status,
                moderator_uid=sirepo.auth.logged_in_user()
            )

        req = sirepo.http_request.parse_post(type=False)
        i = sirepo.auth_db.UserRoleInvite.search_by(token=req.req_data.token)
        if not i:
            pkdlog(f'No record in UserRoleInvite for token={req.req_data.token}')
            raise sirepo.util.UserAlert(
                'Could not find the moderation request; '
                'refresh your browser to get the latest moderation list.',
            )
        p = PKDict(
            app_name=sirepo.simulation_db.SCHEMA_COMMON.appInfo[
                sirepo.auth_role.sim_type(i.role)
            ].longName,
            display_name=sirepo.auth.user_display_name(i.uid),
            role=i.role,
            status=req.req_data.status,
            uid=i.uid,
        )
        _set_moderation_status(p)
        pkdlog('status={} uid={} role={} token={}', p.status, i.uid, i.role, i.token)
        _send_moderation_status_email(p)
        return sirepo.http_reply.gen_json_ok()


    @sirepo.api_perm.require_adm
    def api_admModerateRedirect(self):
        t = set(
            sirepo.feature_config.cfg().sim_types - sirepo.feature_config.auth_controlled_sim_types(),
        ).pop()
        raise sirepo.util.Redirect(sirepo.uri.local_route(t, route_name='admRoles', external=True))

    @sirepo.api_perm.require_adm
    def api_getModerationRequestRows(self):
        return sirepo.http_reply.gen_json(
            PKDict(
                rows=[r.as_pkdict() for r in sirepo.auth_db.UserRoleInvite.get_moderation_request_rows()],
            ),
        )


    @sirepo.api_perm.allow_sim_typeless_require_email_user
    def api_saveModerationReason(self):
        def _send_request_email(info):
            sirepo.smtp.send(
                recipient=_cfg.moderator_email,
                subject=f'{info.sim_type} Access Request',
                body=pkjinja.render_resource('auth_role_moderation/moderation_email', info),
            )

        req = sirepo.http_request.parse_post()
        d = req.req_data
        u = sirepo.auth.logged_in_user()
        r = sirepo.auth_role.for_sim_type(d.simulationType)
        with sirepo.util.THREAD_LOCK:
            if sirepo.auth_db.UserRole.has_role(u, r):
                raise sirepo.util.Redirect(sirepo.uri.local_route(d.simulationType))
            try:
                sirepo.auth_db.UserRoleInvite(
                    uid=u,
                    role=r,
                    status='pending',
                    token=sirepo.util.random_base62(32),
                ).save()
            except sqlalchemy.exc.IntegrityError as e:
                pkdlog('Error={} saving UserRoleInvite for uid={} role={} stack={}', e, u, r, pkdexc())
                raise sirepo.util.UserAlert(
                    f"You've already submitted a moderation request.",
                )

        l = sirepo.uri_router.uri_for_api('admModerateRedirect')
        _send_request_email(
            PKDict(
                display_name=sirepo.auth.user_display_name(u),
                email_addr=sirepo.auth.user_name(),
                link=l,
                reason=d.reason,
                role=sirepo.auth_role.for_sim_type(d.simulationType),
                sim_type=d.simulationType,
                uid=u,
            ).pkupdate(sirepo.http_request.user_agent_headers())
        )
        return sirepo.http_reply.gen_json_ok()


def init_apis():
    global _cfg
    _cfg = pkconfig.init(
        moderator_email=pkconfig.Required(str, 'The email address to send moderation emails to'),
    )