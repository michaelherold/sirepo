class JSFramework {

    static get(name) {
        return new ({
            angularJS: JSFrameworkAngular,
        }[name] || JSFramework)();
    }

    constructor() {
    }

    /**
     *
     * @param {UIField} field
     */
    dressField(field) {

    }

}

/**
 * angular.js stuff
 */
class JSFrameworkAngular extends JSFramework {

    constructor() {
        super();
    }

    buildDirective(name) {

    }
}



SIREPO.JS_FRAMEWORK = {
    JSFramework: JSFramework
};
