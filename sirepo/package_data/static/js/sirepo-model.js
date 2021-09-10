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
            this.fields[f] = SRField(app, f, schema[f]);
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
        this.name = name;
        this.value = null;
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
