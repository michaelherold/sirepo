class SRApp {

    constructor(name, schema) {
        this.name = name;
        this.controllers = {};
        this.enums = {};
        this.framework = JSFramework.get(schema.feature_config.js_framework);
        this.models = {};
        this.panelState = new PanelState();
        this.sections = {};
        this.views = {};

        for (let x in schema.enum) {
            this.enums[x] = new SREnum(x, schema.enum[x]);
        }

        for (let x in schema.model) {
            this.models[x] = new SRModel(x, schema.model[x]);
        }

        for (let x in schema.view) {
            this.views[x] = new SRView(x, schema.view[x]);
        }

        // not worth making a class for?
        for (let x in schema.sections) {
            this.sections[x] = schema.sections[x];
        }

    }

    getField(fieldRef, defaultModel) {
        const m = fieldRef.split('.');
        if (m.length > 2) {
            return this.getField(m.slice(1).join('.'), defaultModel);
        }
        if (m.length > 1) {
            return this.models[m[0]][m[1]];
        }
        return defaultModel[m[0]];
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
    constructor(schema) {
        this.name = schema[0];
        this.fieldRefs = [];
        for (let f of schema[1]) {
            this.fieldRefs.push(f);
        }
    }
}

/**
 * tab sections
 */
class SRSection {
    constructor(schema) {
    }
}


/**
 * Organized collection of fields
 */
class SRColumnGroup {

}


/**
 * Organized collection of pages or fields
 */
class SRForm {

    constructor(schema) {
        this.pages = null;
        this.fieldRefs = [];
        for (let f of schema) {
            if (typeof(f) === 'string') {
                this.fieldRefs.push(f);
                continue;
            }
            if (! this.pages) {
                this.pages = [];
            }
            this.pages.push(new SRPage(f));
        }
    }
}

/**
 * Organized collection of forms
 */
class SRView {

    constructor(name, schema) {
        this.name = name;
        this.title = schema.title;

        if (schema.basic) {
            this.basicForm = new SRForm(schema.basic);
        }
        if (schema.advanced) {
            this.advancedForm = new SRForm(schema.advanced);
        }

    }
}


class SRFieldDefinition {

    static builtIn(baseType, isRequired=true) {
        let baseInput = new UIInput(null, 'text', `${this.default}`, [
            new UIAttribute('data-min', `${this.min}`),
            new UIAttribute('data-max', `${this.max}`),
            new UIAttribute('data-lpignore', 'true')
        ]);

        if (isRequired) {
            baseInput.addAttribute('required');
        }

        return {
            number: baseInput,
        }[baseType];
    }

    constructor(def) {
        const INDEX_TO_FIELD = ['label',  'type', 'default', 'toolTip', 'min', 'max',];
        for (let i = 0; i < INDEX_TO_FIELD.length; ++i) {
            this[INDEX_TO_FIELD[i]] = def[i] || null;
        }
    }

    ui(isRequired=true) {
        let ui = new SIREPO.DOM.UIDiv();
        let f = {
            Integer: SRFieldDefinition.builtIn('number'),
            Float: SRFieldDefinition.builtIn('number'),
        }[this.type];
        ui.addChild(f);
        return ui;
    }
}

class SRField {

    constructor(name, def) {
        this.name = name;
        this.def = new SRFieldDefinition(def);
        this.value = this.def.default;
    }

    getValue() {
        return this.value;
    }

    setValue(val) {
        this.value = val;
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
