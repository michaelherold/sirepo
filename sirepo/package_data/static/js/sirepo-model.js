class SRApp {

    static SCHEMA_TYPES() {
        // order matters, as model requires enum and view requies model
        return {
            enum: SREnum,
            model: SRModel,
            view: SRView,
        }
    }

    constructor(name, schema) {
        this.name = name;

        const types = SRApp.SCHEMA_TYPES();
        for (let t of Object.keys(types)) {
            this[t] = {};
            for (let x in schema[t]) {
                this[t][x] = new types[t](this, x, schema[t][x]);
            }
        }
    }
}

class SRModel {
    constructor(app, name, schema) {
        this.name = name;
        this.fields = {};
        for (let f in schema) {
            this.fields[f] = new SRField(app, f, schema[f]);
        }
    }
}


class SRView {
    constructor(app, name, schema) {
        this.name = name;
        this.pages = {};
    }
}

class SRField {

    constructor(app, name, schema) {
        const INDEX_LABEL = 0;
        const INDEX_TYPE = 1;
        const INDEX_DEFAULT_VALUE = 2;
        const INDEX_TOOL_TIP = 3;
        const INDEX_MIN = 4;
        const INDEX_MAX = 5;

        this.name = name;

        this.label = schema[INDEX_LABEL];
        this.max = schema[INDEX_MAX];
        this.min = schema[INDEX_MIN];
        this.value = schema[INDEX_DEFAULT_VALUE];
        this.toolTip = schema[INDEX_TOOL_TIP];
        this.type = schema[INDEX_TYPE];
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
    constructor(name, schEntries) {
        this.name = name;
        this.entries = {};
        this.addEntries(schEntries);
    }

    addEntry(schEnum) {
        let e = new SREnumEntry(schEnum);
        this.entries[e.label] = e;
    }

    addEntries(schEntries) {
        Object.assign(this.entries, SREnum.entriesFromSchema(schEntries));
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

SIREPO.APP = {
    SRApp: SRApp,
    SREnum: SREnum,
};
