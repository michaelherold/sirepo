#!/bin/bash
set -eou pipefail

if [[ ! -d ~/mail ]]; then
    install -m 700 -d ~/mail
    install -m 600 /dev/stdin ~/.procmailrc <<'END'
UMASK=077
:0
mail/.
END
    sudo su - <<'END'
        dnf install -y postfix procmail
        postconf -e \
            'mydestination=$myhostname, localhost.$mydomain, localhost, localhost.localdomain' \
            mailbox_command=/usr/bin/procmail
        systemctl enable postfix
        systemctl restart postfix
END
    echo 'Testing mail delivery'
    echo hello | sendmail vagrant@localhost.localdomain
    sleep 4
    if ! grep -s hello ~/mail/1; then
        echo mail delivery test failed
        exit 1
    fi
    rm ~/mail/1
fi

# see run-jupyterhub.sh for setting up local mail delivery
export SIREPO_FROM_EMAIL='$USER+support@localhost.localdomain'
export SIREPO_FROM_NAME='RadiaSoft Support'
export SIREPO_SMTP_SERVER='localhost'
export SIREPO_SMTP_SEND_DIRECTLY=1
export SIREPO_AUTH_METHODS='email:guest'
export PYKERN_PKDEBUG_WANT_PID_TIME=1
exec sirepo service http
