"""Duplicate all fnl* hosts with a bkf*

Usage:
  cat ~/.ssh/known_hosts | fix-known-hosts.py
  # Outputs known_hosts.out which you can diff and cp to correct location if it looks good.
"""
from pykern.pkdebug import pkdp
import fileinput
import re
from pykern import pkio


res = []

def _add_line_ending_to_last_original_host_if_fnl():
    if len(res) < 2:
        return
    if res[-2][-1] == '\n':
        return
    m = re.match(r'^fnl([0-9]*[ibm])', res[-2])
    assert m, f'expecting second to last host={res[-2]} to be an fnl host'
    s = fr'^bkf{m[1]}'
    assert re.match(s, res[-1]), \
        f'expecting last host={res[-1]} to be match {s}'
    res[-2] += '\n'

def _main():
    for l in fileinput.input():
        def _replace_fnl_with_bkf(line):
            return re.sub(r'^fnl', 'bkf', line)

        def _strip_ip_addr(line):
            return re.sub(r',(?:[0-9]{1,3}\.){3}[0-9]{1,3} ', ' ', line)

        res.append(l)
        if not re.match(r'^fnl', l):
            continue
        b = _replace_fnl_with_bkf(l)
        b = _strip_ip_addr(b)
        res.append(b)
    _add_line_ending_to_last_original_host_if_fnl()
    pkio.write_text('known_hosts.out', ''.join(res))

if __name__ == '__main__':
    _main()
