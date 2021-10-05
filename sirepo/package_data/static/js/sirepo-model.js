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
            this.models[x] = new SREnum(x, schema.model[x]);
        }

        // need the models to assign the correct fields
        for (let x in schema.view) {
            this.views[x] = new SRView(x, schema.view[x], models);
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
class SRForm {

    static getField(fieldName, defaultModel, models) {
        for (let m of fieldName.split('.')) {

        }
    }

    constructor(schema, defaultModel, models) {
        this.pages = {};
        this.fields = [];
        for (let f of schema) {
            if (f instanceof String) {
                this.fields.push(getField(f, defaultModel, models));
            }
            if (f instanceof Array) {
                this.pages[f[0]] = [];
            }
        }
    }
}

/**
 * Organized collection of forms
 */
class SRView {
    constructor(name, schema, models) {
        this.name = name;
        this.model = model[schema.model || this.name];

        this.title = schema.title;

        this.basicForm = new SRForm(schema.basic, model, models);
        this.advancedForm = new SRForm(schema.advanced, model, models);
    }
}

class SRField {

    constructor(name, schema) {
        this.name = name;

        const INDEX_TO_FIELD = ['label',  'type', 'default', 'toolTip', 'min', 'max',];
        for (let i = 0; i < INDEX_TO_FIELD.length; ++i) {
            this[INDEX_TO_FIELD[i]] = schema[i] || null;
        }
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
