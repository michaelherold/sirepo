# -*- coding: utf-8 -*-
"""simulation data operations

:copyright: Copyright (c) 2019 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function

from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdlog, pkdp
import copy
import sirepo.sim_data


class SimData(sirepo.sim_data.SimDataBase):

    ANALYSIS_ONLY_FIELDS = frozenset(
        (
            "alpha",
            "bgColor",
            "color",
            "colorMap",
            "name",
            "notes",
            "scaling",
        )
    )

    @classmethod
    def _compute_job_fields(cls, data, r, compute_model):
        res = cls._non_analysis_fields(data, r) + []
        return res

    @classmethod
    def _compute_model(cls, analysis_model, *args, **kwargs):
        if analysis_model == "fieldLineoutAnimation":
            return "fieldLineoutAnimation"
        elif analysis_model in ("solverAnimation", "reset"):
            return "solverAnimation"
        return super(SimData, cls)._compute_model(analysis_model, *args, **kwargs)

    @classmethod
    def __dynamic_defaults(cls, data, model):
        """defaults that depend on the current data"""
        return PKDict()

    @classmethod
    def _fixup_box_to_cuboid(cls, model, field):
        if model.get(field) == "box":
            model[field] = "cuboid"

    @classmethod
    def _fixup_example(cls, models):
        if not models.simulation.get("exampleName"):
            models.simulation.exampleName = models.simulation.name
        if models.simulation.name == "Dipole":
            models.simulation.beamAxis = "x"
            models.simulation.heightAxis = "z"
            models.simulation.widthAxis = "y"
        if models.simulation.name == "Wiggler":
            models.geometryReport.isSolvable = "0"
            if not len(models.fieldPaths.paths):
                models.fieldPaths.paths.append(
                    PKDict(
                        _super="fieldPath",
                        begin=[0, -225, 0],
                        end=[0, 225, 0],
                        id=0,
                        name="y axis",
                        numPoints=101,
                        type="line",
                    )
                )

    @classmethod
    def _fixup_obj_types(cls, dm):
        if dm.get("box"):
            dm.cuboid = dm.box.copy()
            del dm["box"]
        for m in dm:
            for f in (
                "magnetObjType",
                "poleObjType",
                "type",
            ):
                cls._fixup_box_to_cuboid(dm[m], f)
        for o in dm.geometryReport.objects:
            for f in (
                "model",
                "type",
            ):
                cls._fixup_box_to_cuboid(o, f)

    @classmethod
    def fixup_old_data(cls, data):
        import sirepo.util

        sch = cls.schema()

        def _delete_old_fields(model):
            for f in ("divisions",):
                if model.get(f):
                    del model[f]

        def _fixup_array(model, model_type_field, model_field):
            for o in model.get(model_field, []):
                if model_type_field not in o:
                    continue
                _fixup_number_string_fields(o[model_type_field], o)
                _fixup_array(o, model_type_field, model_field)

        def _fixup_boolean_fields(model_name, model):
            s_m = sch.model[model_name]
            for f in [
                f for f in s_m if f in model and s_m[f][1] == "Boolean" and not model[f]
            ]:
                model[f] = "0"

        def _fixup_number_string_field(model, field, to_type=float):
            if field not in model:
                return
            if isinstance(model[field], str):
                model[field] = sirepo.util.split_comma_delimited_string(
                    model[field], to_type
                )

        def _fixup_number_string_fields(model_name, model):
            if not model_name or not model:
                return
            s_m = sch.model.get(model_name)
            if not s_m:
                return
            for f in model:
                if f not in s_m:
                    continue
                sf = s_m[f][1]
                if sf == "FloatArray":
                    _fixup_number_string_field(model, f)
                    continue
                if sf == "IntArray":
                    _fixup_number_string_field(model, f, to_type=int)
                    continue
                if sf.startswith("model."):
                    _fixup_number_string_fields(sf.split(".")[-1], model[f])
                    _fixup_transforms(model[f])
            sc = [x for x in s_m.get("_super", []) if x != "_" and x != "model"]
            if sc:
                _fixup_number_string_fields(sc[0], model)

        def _fixup_geom_objects(objects):
            for o in objects:
                if o.get("points") is not None and not o.get("triangulationLevel"):
                    o.triangulationLevel = 0.5
                if not o.get("bevels"):
                    o.bevels = []
                for b in o.bevels:
                    if not b.get("cutRemoval"):
                        b["cutRemoval"] = "1"
                if not o.get("fillets"):
                    o.fillets = []
                if not o.get("segments"):
                    o.segments = o.get("division", [1, 1, 1])
                for f in (
                    "type",
                    "model",
                ):
                    _fixup_number_string_fields(o.get(f), o)
                # fix "orphan" fields
                for f in (
                    "center",
                    "magnetization",
                    "segments",
                    "size",
                ):
                    _fixup_number_string_field(o, f)
                _fixup_terminations(o)
                _fixup_transforms(o)
                _delete_old_fields(o)

        def _fixup_field_paths(paths):
            for p in paths:
                for f in (
                    "begin",
                    "end",
                ):
                    _fixup_number_string_field(p, f)

        def _fixup_terminations(model):
            for t in filter(
                lambda x: x,
                map(lambda x: x.get("object"), model.get("terminations", [])),
            ):
                _fixup_number_string_fields(t.get("type"), t)

        def _fixup_transforms(model):
            _fixup_array(model, "model", "transforms")

        dm = data.models
        cls._init_models(dm, None, dynamic=lambda m: cls.__dynamic_defaults(data, m))
        if dm.get("geometry"):
            dm.geometryReport = dm.geometry.copy()
            del dm["geometry"]
        if dm.get("solver"):
            dm.solverAnimation = dm.solver.copy()
            del dm["solver"]
        if not dm.fieldPaths.get("paths"):
            dm.fieldPaths.paths = []
        if dm.simulation.get("isExample"):
            cls._fixup_example(dm)
        if dm.simulation.magnetType == "undulator":
            cls._fixup_undulator(dm)
        cls._fixup_obj_types(dm)
        _fixup_geom_objects(dm.geometryReport.objects)
        _fixup_field_paths(dm.fieldPaths.paths)
        for name in [name for name in dm if name in sch.model]:
            _delete_old_fields(dm[name])
            _fixup_boolean_fields(name, dm[name])
            _fixup_number_string_fields(name, dm[name])
            _fixup_terminations(dm[name])
            _fixup_transforms(dm[name])
        cls._organize_example(data)

    @classmethod
    def _fixup_undulator(cls, dm):
        import sirepo.util

        if not dm.simulation.get("heightAxis"):
            dm.simulation.heightAxis = "z"

        if not dm.simulation.get("coordinateSystem"):
            dm.simulation.coordinateSystem = "beam"

        if "hybridUndulator" in dm:
            dm.undulatorHybrid = copy.deepcopy(dm.hybridUndulator)
            del dm["hybridUndulator"]
            dm.simulation.undulatorType = "undulatorHybrid"
            dm.undulatorHybrid.undulatorType = "undulatorHybrid"

        if dm.undulatorHybrid._super == "undulator":
            dm.undulatorHybrid._super = "undulatorBasic"

        if dm.simulation.undulatorType == "undulatorBasic":
            return

        u = dm.undulatorHybrid
        g = dm.geometryReport

        for (k, v) in PKDict(
            halfPole="Half Pole",
            magnet="Magnet Block",
            pole="Pole",
            corePoleGroup="Magnet-Pole Pair",
            terminationGroup="Termination",
            octantGroup="Octant",
        ).items():
            if k not in u:
                u[k] = sirepo.util.find_obj(g.objects, "name", v)

        if not u.get("terminations"):
            u.terminations = [PKDict() for _ in range(len(u.terminationGroup.members))]
        for i, t_id in enumerate(u.terminationGroup.members):
            t = u.terminations[i]
            cls.update_model_defaults(t, "termination")
            t.object = sirepo.util.find_obj(g.objects, "id", t_id)

    @classmethod
    def sim_files_to_run_dir(cls, data, run_dir, post_init=False):
        try:
            super().sim_files_to_run_dir(data, run_dir)
        except sirepo.sim_data.SimDbFileNotFound as e:
            if post_init:
                raise e

    @classmethod
    def _lib_file_basenames(cls, data):
        res = []
        if "dmpImportFile" in data.models.simulation:
            res.append(
                f"{cls.schema().constants.radiaDmpFileType}.{data.models.simulation.dmpImportFile}"
            )
        if "fieldType" in data:
            res.append(
                cls.lib_file_name_with_model_field(
                    "fieldPath", data.fieldType, data.name + "." + data.fileType
                )
            )
        return res

    @classmethod
    def _sim_file_basenames(cls, data):
        # TODO(e-carlin): share filename with template
        return [
            PKDict(basename="geometry.dat"),
            PKDict(basename="geometryReport.h5"),
        ]
