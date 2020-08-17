# -*- coding: utf-8 -*-
u"""MAD-X parser.

:copyright: Copyright (c) 2020 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkio
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdlog, pkdp
from sirepo.template import lattice
import re
import sirepo.sim_data


class MadXParser(lattice.LatticeParser):
    def __init__(self):
        self.ignore_commands = set([
            'aperture', 'assign', 'call', 'coguess',
            'correct', 'create', 'ealign', 'efcomp', 'emit',
            'endedit', 'eoption', 'esave', 'exec', 'exit', 'fill',
            'install',
            'plot', 'print', 'quit',
            'readtable', 'reflect', 'return', 'run', 'save',
            'select_ptc_normal', 'seqedit',
            'setplot', 'setvars', 'setvars_lin',
            'simplex', 'sixtrack', 'start', 'stop', 'survey',
            'sxfread', 'sxfwrite', 'system', 'touschek', 'use_macro',
            'usekick', 'usemonitor', 'value', 'weight',
            'wire', 'write',
        ])
        super().__init__(sirepo.sim_data.get_class('madx'))

    def parse_file(self, lattice_text, downcase_variables=False):
        from sirepo.template import madx
        res = super().parse_file(lattice_text)
        cv = madx.madx_code_var(self.data.models.rpnVariables)
        self._code_variables_to_float(cv)
        self.__convert_sequences_to_beamlines(cv)
        self._set_default_beamline('use', 'sequence', 'period')
        self.__convert_references_to_ids()
        if downcase_variables:
            self._downcase_variables(cv)
        return res

    def __convert_references_to_ids(self):
        util = lattice.LatticeUtil(self.data, self.schema)
        name_to_id = PKDict()
        for id in util.id_map:
            name = util.id_map[id].name
            if not name:
                continue
            name = name.upper()
            #assert name not in name_to_id, 'duplicate name: {}'.format(name)
            name_to_id[name] = id
        for container in ('elements', 'commands'):
            for el in self.data.models[container]:
                model_schema = self.schema.model[lattice.LatticeUtil.model_name_for_data(el)]
                for f in model_schema:
                    el_schema = model_schema[f]
                    if f in el:
                        if el[f] and 'LatticeBeamlineList' in el_schema[1]:
                            el[f] = name_to_id[el[f].upper()]
                        elif el[f] and el_schema[1] == 'OutputFile' and el[f] != '0':
                            el[f] = '1'
                        elif el_schema[1] in self.schema.enum:
                            #TODO(pjm): ensure value is present in enum list
                            el[f] = el[f].lower()
                            if 'Boolean' in el_schema[1]:
                                if el[f] == '1' or el[f] == '0':
                                    pass
                                elif el[f].lower() == 'true':
                                    el[f] = '1'
                                else:
                                    el[f] = '0'

    def __convert_sequences_to_beamlines(self, code_var):
        data = PKDict(
            models=self.data.models,
        )
        drifts = self._compute_drifts(code_var)
        util = lattice.LatticeUtil(data, self.schema)
        for seq in data.models.sequences:
            beamline = PKDict(
                name=seq.name,
                items=[],
            )
            alignment = seq.refer.lower() if 'refer' in seq else 'centre'
            assert alignment in ('entry', 'centre', 'exit'), \
                'invalid sequence alignment: {}'.format(alignment)
            prev = None
            for item in seq['items']:
                el = util.id_map[item[0]]
                at = self._eval_var(code_var, item[1])
                length = self._eval_var(code_var, el.get('l', 0))
                entry = at
                if alignment == 'centre':
                    entry = at - length / 2
                elif alignment == 'exit':
                    entry = at - length
                if prev is not None:
                    d = self._get_drift(drifts, entry - prev)
                    if d:
                        beamline['items'].append(d)
                beamline['items'].append(el._id)
                prev = entry + length
            if len(beamline['items']):
                if 'l' in seq:
                    d = self._get_drift(drifts, self._eval_var(code_var, seq.l) - prev)
                    if d:
                        beamline['items'].append(d)
                beamline.id = self.parser.next_id()
                data.models.beamlines.append(beamline)
        del data.models['sequences']
        util.sort_elements_and_beamlines()


def parse_file(lattice_text, downcase_variables=False):
    return MadXParser().parse_file(lattice_text, downcase_variables)


def parse_tfs_page_info(tfs_file):
    # returns an array of page info: name, turn, s
    col_names = parse_tfs_file(tfs_file, header_only=True)
    turn_idx = col_names.index('turn')
    s_idx = col_names.index('s')
    res = []
    mode = 'segment'
    with pkio.open_text(tfs_file) as f:
        for line in f:
            if mode == 'segment' and re.search(r'^\#segment\s', line):
                name = re.split(r'\s+', line.strip())[-1]
                res.append(PKDict(
                    name=name,
                ))
                mode = 'data'
            elif mode == 'data' and re.search(r'^\s+\S', line):
                data = re.split(r'\s+', line.strip())
                res[-1].update(PKDict(
                    turn=data[turn_idx],
                    s=data[s_idx],
                ))
                mode = 'segment'
    return res


def parse_tfs_file(tfs_file, header_only=False, want_page=-1):
    mode = 'header'
    col_names = []
    rows = []
    current_page = -1
    with pkio.open_text(tfs_file) as f:
        for line in f:
            if mode == 'header':
                # header row starts with *
                if re.search(r'^\*\s', line):
                    col_names = re.split(r'\s+', line.strip())
                    col_names = col_names[1:]
                    mode = 'data'
                    if header_only:
                        return [x.lower() for x in col_names]
            elif mode == 'data':
                # data rows after header, start with blank
                if re.search(r'^\s+\S', line) and want_page == current_page:
                    data = re.split(r'\s+', line.strip())
                    rows.append(data)
                elif want_page >= 0 and re.search(r'^\#segment\s', line):
                    current_page += 1
    res = PKDict(map(lambda x: (x.lower(), []), col_names))
    for i in range(len(col_names)):
        name = col_names[i].lower()
        if name:
            for row in rows:
                res[name].append(row[i])
    return res
