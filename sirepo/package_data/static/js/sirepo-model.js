class SRApp {
    constructor(name, schema) {
        this.name = name;
        this.enums = {};
        for (let e in schema.enum) {
            this.enums[e] = new SREnum(e, schema.enum[e]);
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
