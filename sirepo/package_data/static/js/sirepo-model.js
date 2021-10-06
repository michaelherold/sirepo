class SRApp {

    constructor(name, schema) {
        this.name = name;
        this.controllers = {};
        this.enums = {};
        this.models = {};
        this.views = {};
        this.panelState = new PanelState();

        for (let x in schema.enum) {
            this.enums[x] = new SREnum(x, schema.enum[x]);
        }

        for (let x in schema.model) {
            this.models[x] = new SRModel(x, schema.model[x]);
        }

        // need the models to assign the correct fields
        for (let x in schema.view) {
            this.views[x] = new SRView(x, schema.view[x], this.models);
        }

        // make controllers linking models and views
        for (let x in this.views) {

        }

    }


}

class SRModel {
    constructor(name, schema) {
        this.name = name;
        this.fields = {};
        for (let f in schema) {
            this.fields[f] = new SRField(f, schema[f]);
        }
    }
}


/**
 * Organized collection of fields
 */
class SRPage {
    constructor(schema, defaultModel, models) {
        this.name = schema[0];
        this.fields = [];
        for (let f of schema[1]) {
            this.fields.push(SRField.fromModelField(f, defaultModel, models));
        }
    }
}


/**
 * Organized collection of fields
 */
class SRFieldGroup {

}


/**
 * Organized collection of pages or fields
 */
class SRForm {

    constructor(schema, defaultModel, models) {
        this.pages = [];
        this.fields = [];
        for (let f of schema) {
            if (f instanceof String) {
                this.fields.push(SRField.fromModelField(f, defaultModel, models));
                continue;
            }
            this.pages.push(new SRPage(f, defaultModel, models));
        }
    }
}

/**
 * Organized collection of forms
 */
class SRView {

    static getField(fieldName, defaultModel, models) {
        const m = fieldName.split('.');
        if (m.length > 2) {
            return SRView.getField(m.slice(1).join('.'), defaultModel, models);
        }
        if (m.length > 1) {
            return models[m[0]][m[1]];
        }
        return defaultModel[m[0]];
    }

    constructor(name, schema, models) {
        this.name = name;
        this.model = models[schema.model || this.name];
        this.controllers = {};
        this.controllers[this.name] = new SRController(this.model, this);

        this.title = schema.title;

        if (schema.basic) {
            this.basicForm = new SRForm(schema.basic, this.model, models);
        }
        if (schema.advanced) {
            this.advancedForm = new SRForm(schema.advanced, this.model, models);
        }

    }
}


class SRFieldDefinition {

    static typeCheckers(type) {
        const c = {
            'Integer': v => {
                if (isNaN(parseInt(v))) {
                    throw new Error(`v=${v}: not an integer`)
                }
                return v;
            },
            // etc.
        };
        return c[type] || function (v) { return v; };
    }

    constructor(def) {
        srdbg('bld def from', def);
        const INDEX_TO_FIELD = ['label',  'type', 'default', 'toolTip', 'min', 'max',];
        for (let i = 0; i < INDEX_TO_FIELD.length; ++i) {
            this[INDEX_TO_FIELD[i]] = def[i] || null;
        }
    }

    checkType(val) {
        return SRFieldDefinition.typeCheckers(this.type)(val);
    }
}

class SRField {

    static fromModelField(fieldName, defaultModel, models) {
        const m = fieldName.split('.');
        if (m.length > 2) {
            return SRField.fromModelField(m.slice(1).join('.'), defaultModel, models);
        }
        if (m.length > 1) {
            return new SRField(m[1], models[m[0]]);
        }
        return new SRField(m[0], models[defaultModel]);
    }

    constructor(name, def) {
        srdbg('bld f from', name, def);
        this.name = name;
        this.def = new SRFieldDefinition(def);
        this.value = this.def.default;
    }

    setValue(val) {
        this.value = this.def.checkType(val);
    }

}

// takes an array of the form [<value>, <label>]
class SREnumEntry {
    constructor(schEnum) {
        const INDEX_VALUE = 0;
        const INDEX_LABEL = 1;
        this.label = schEnum[INDEX_LABEL];
        this.value = schEnum[INDEX_VALUE];
    }
}

class SREnum {

    static entriesFromSchema(schEntries) {
        let entries = {};
        for (let e of schEntries) {
            const entry = new SREnumEntry(e);
            entries[entry.label] = entry;
        }
        return entries;
    }

    // schEntries is a dict:
    // {
    //    <enumName> : [
    //      [<value>, <label>],
    //      ...
    //    ],
    //    ...
    // }
    constructor(name, schema) {
        this.name = name;
        this.entries = {};
        this.addEntries(schema);
    }

    addEntry(schEnum) {
        let e = new SREnumEntry(schEnum);
        this.entries[e.label] = e;
    }

    addEntries(schema) {
        Object.assign(this.entries, SREnum.entriesFromSchema(schema));
    }

    clearEntries() {
        this.entries = {};
    }

    getEntry(label) {
        return this.entries[label];
    }

    setEntries(schEntries) {
        this.clearEntries();
        this.addEntries(schEntries);
    }
}

class SRReport {

    constructor(model) {
    }
}


/**
 * Link a model and view
 */
class SRController {
    /**
     * @param {SRModel} model
     * @param {SRView} view
     */
    constructor(model, view) {
        this.model = model;
        this.view = view;
    }


}

class PanelState {

    constructor() {
        this.panels = {};
        this.queueItems = {};
    }

    getError(name) {
        return this.getPanelValue(name, 'error');
    }

    getPanelValue(name, key) {
        return (this.panels[name] || {})[key];
    }

    isLoading(name) {
        return this.getPanelValue(name, 'loading') ? true : false;
    };

    isRunning(name) {
        return false;
    }

    isHidden(name) {
        return false;
    }


}

SIREPO.APP = {
    PanelState: PanelState,
    SRApp: SRApp,
    SREnum: SREnum,
};
