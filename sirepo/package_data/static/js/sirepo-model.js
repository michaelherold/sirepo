'use strict';

/**
 * A class defining an app based on its schema.
 */
class SRApp {

    constructor(name, schema) {
        this.name = name;
        this.controllers = {};
        this.enums = {};
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

    editor(viewName, formType) {
        const v = this.views[viewName];
        const f = v.getForm(formType);

        let e = new SIREPO.DOM.UIDiv();
        let form = new SIREPO.DOM.UIElement('form', null, [
            new SIREPO.DOM.UIAttribute('autocomplete', 'off'),
            new SIREPO.DOM.UIAttribute('novalidate', ''),
        ]);
        form.addClasses('form-horizontal');
        e.addChild(form);

        if (f.pages) {
            for (let p in f.pages) {
            }
            return e;
        }

        for (let fr of f.fieldRefs) {
            let x = new SIREPO.DOM.UIDiv();
            x.addClasses('form-group form-group-sm');
            form.addChild(x);
            x.addChild(this.getFieldFromRef(fr).def.editor());
        }
        return e;
    }

    getFieldFromModel(modelName, fieldName) {
        return this.getModel(modelName).getField(fieldName);
    }

    /**
     *
     * @param {string} fieldRef - qualified field reference
     * @return {SRField} - the field
     */
    getFieldFromRef(fieldRef) {
        const m = fieldRef.split('.');
        if (m.length > 2) {
            return this.getFieldFromRef(m.slice(1).join('.'));
        }
        if (m.length > 1) {
            return this.getFieldFromModel([m[0]], [m[1]]);
        }
        return null;
    }

    getModel(modelName) {
        return this.models[modelName];
    }

    setFieldValue(modelName, fieldName, value) {
        this.getModel(modelName).getField(fieldName).setValue(value);
    }

    setFieldRefValue(fieldRef, value) {
        this.getFieldFromRef(fieldRef).setValue(value);
    }

}

class SRModel {

    static fieldRef(modelName, fieldName) {
        return `${modelName}.${fieldName}`;
    }

    static qualifyFieldRef(modelName, fieldName) {
        return fieldName.includes('.') ? fieldName : SRModel.fieldRef(modelName, fieldName);
    }

    constructor(name, schema) {
        this.name = name;
        this.fields = {};
        for (let f in schema) {
            this.fields[f] = new SRField(f, schema[f]);
        }
    }

    getField(fieldName) {
        return this.fields[fieldName];
    }

    fieldRef(fieldName) {
        return SRModel.fieldRef(this.name, fieldName);
    }
}


/**
 * Organized collection of fields
 */
class SRPage {
    constructor(schema, defaultModelName) {
        this.name = schema[0];
        this.fieldRefs = [];
        for (let f of schema[1]) {
            this.fieldRefs.push(SRModel.qualifyFieldRef(defaultModelName, f));
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
 * Organized collection of pages or field references. A field reference is either the name of a field
 * or a '.'-delimited string of model names terminated by a field name (i.e. <model 1>.<model 2>...<field>.
 * Field references are qualified with a default model name if they are not already so constructed.
 * The schema is assumed to have either field refs or pages, NOT both
 */
class SRForm {

    /**
     * @param {*} schema - schema defining this form
     * @param {string} defaultModel - model name to use for unqualified field names
     */
    constructor(schema, defaultModelName) {
        this.pages = null;
        this.fieldRefs = [];
        for (let f of schema) {
            if (typeof(f) === 'string') {
                this.fieldRefs.push(SRModel.qualifyFieldRef(defaultModelName, f));
                continue;
            }
            if (! this.pages) {
                this.pages = [];
            }
            this.pages.push(new SRPage(f, defaultModelName));
        }
    }

    /**
     * Get a page in this form by name
     * @param {string} pageName - the page
     */
    getPage(pageName) {
        return this.pages[pageName];
    }
}

/**
 * Organized collection of forms. The hierarchy is:
 *    view -> forms (basic|advanced) -> pages -> field references
 */
class SRView {

    /**
     * @param {string} name - name of the view
     * @param {*} schema - schema defining this view
     */
    constructor(name, schema) {
        this.name = name;
        this.title = schema.title;
        this.defaultModelName = schema.model || name;

        for (let f of ['basic', 'advanced']) {
            if (schema[f]) {
                this[f] = new SRForm(schema[f], this.defaultModelName);
            }
        }
    }

    /**
     * Get the form of this type
     * @param {string} formType - basic|advanced
     * @return {SRForm} - the form for this type
     */
    getForm(formType) {
        return this[formType];
    }

    /**
     * Get a page from the form of this type
     * @param {string} formType - basic|advanced
     * @param {string} pageName - name of the page
     * @return {SRPage}
     */
    getPage(formType, pageName) {
        return this.getForm(formType).getPage(pageName);
    }

}


/**
 * A class defining various aspects of a model field.
 */
class SRFieldDefinition {

    static builtIn(baseType, isRequired=true) {
        let baseInput = new SIREPO.DOM.UIInput(null, 'text', `${this.default}`, [
            new SIREPO.DOM.UIAttribute('data-min', `${this.min}`),
            new SIREPO.DOM.UIAttribute('data-max', `${this.max}`),
            new SIREPO.DOM.UIAttribute('data-lpignore', 'true')
        ]);

        if (isRequired) {
            baseInput.addAttribute('required');
        }

        return {
            number: baseInput,
        }[baseType];
    }

    /**
     * @param {[*]} def - array of field properties. Canonically these are
     *     [
     *         <field label> (str),
     *         <field type> (str),
     *         <default value> (*),
     *         [<tool tip>] (str),
     *         [<min>] (number),
     *         [<max>] (number)
     *     ]
     *
     * Not all properties have meaning for all field types. Further, some apps use custom properties beyond
     * the range of this class
     */
    constructor(def) {
        const INDEX_TO_PROPERTY = ['label',  'type', 'default', 'toolTip', 'min', 'max',];
        for (let i = 0; i < INDEX_TO_PROPERTY.length; ++i) {
            this.addProperty([INDEX_TO_PROPERTY[i]], def[i] || null);
        }
    }

    /**
     * Add a property to this field definition
     * @param {string} name - name of the proprty
     * @param {*} value - its value
     */
    addProperty(name, value) {
        this[name] = value;
    }

    editor(isRequired=true) {
        let ui = new SIREPO.DOM.UIDiv();
        let f = {
            Integer: SRFieldDefinition.builtIn('number', isRequired),
            Float: SRFieldDefinition.builtIn('number', isRequired),
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

    // schEntries is a dict:
    // {
    //    <enumName> : [
    //      [<value>, <label>],
    //      ...
    //    ],
    //    ...
    // }
    static entriesFromSchema(schEntries) {
        let entries = {};
        for (let e of schEntries) {
            const entry = new SREnumEntry(e);
            entries[entry.label] = entry;
        }
        return entries;
    }

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
    }

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
    SREnumEntry: SREnumEntry,
};
