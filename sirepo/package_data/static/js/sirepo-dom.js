'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

/**
 * HTML attribute (<element name="value">...)
 */
class UIAttribute {
    /**
     * @param {string} name - name of the attribute
     * @param {string} value - value of the attribute
     */
    constructor(name, value) {
        this.name = name;
        this.setValue(value);
    }

    /**
     * Builds a template string from an array of UIAttributes
     * @param arr {[UIAttribute]} - array of attributes
     * @returns {string} - template string
     */
    static attrsToTemplate(arr) {
        let s = '';
        for (let attr of arr) {
            s += `${attr.toTemplate()} `;
        }
        return s;
    }

    /**
     * Sets the value of this attribute
     * @param value {string} - value of the attribute
     */
    setValue(value) {
        this.value = value;
    }

    /**
     * Builds the template string for this attribure
     * @returns {string} - template string
     */
    toTemplate() {
        //return `${this.encode(this.name)}="${this.encode(this.value)}"`;
        return `${this.name}="${this.value}"`;
    }
}

/**
 * Style attributes have the form 'name1: val1:;...'
 * This class allows manipulation of its individual components
 */
class UIStyle {

    /**
     * Build a UIStyle from a string
     * @param {string} val - the string
     */
    static fromString(val) {
        let o = {};
        for (let x of val.split(/\s*;\s*/)) {
            const v = x.split(/\s*:\s*/);
            o[v[0]] = o[v[1]];
        }
        return new UIStyle(o);
    }

    /**
     * @param {{string:string}} obj - value of the attribute
     */
    constructor(obj) {
        this.settings = obj || {};
    }

    getSetting(name) {
        return this.settings[name];
    }

    removeSetting(name) {
        delete this.settings[name];
    }

    setSetting(name, value) {
        this.settings[name] = value;
    }

    toDict() {
        return this.settings;
    }

    toAttr() {
        return new UIAttribute('style', this.toString());
    }

    toString() {
        let s = '';
        for (let x in this.settings) {
            s += `${x}: ${this.settings[x]}; `;
        }
        return s;
    }


}

/**
 * HTML Element (<element> text </element>)
 */
class UIElement {  //extends UIOutput {

    // no children
    static fromDOM(dom) {
        let el = new UIElement(dom.tagName, dom.getAttribute('id'));
        for (let a of dom.attributes) {
            el.addAttribute(a.name, a.value);
        }
        for (let c of dom.children) {
            el.addChild(UIElement.fromDOM(c));
        }
        return el;
    }

    /**
     * @returns {{id: null, attrs: *[]}}
     */
    static defaultKwargs() {
        return {id: null, attrs: []};
    }

    /**
     * @param {string} tag - tag name for this element
     * @param {string} [id] - id for this element. The class will generate an id if one is not provided
     * @param {[UIAttribute]} [attrs] - array of UIAttributes. If "id" is among them, it will be overwitten by the id param
     */
    constructor(tag, {id, attrs}=UIElement.defaultKwargs()) {
        this.tag = tag;

        /** @member {Object<string:UIAttribute>} - dictionary of attributes keyed by name */
        this.attrs = {};
        this.id = this.srId(id);

        /** @member {[UIElement]} - arrray of child elements */
        this.children = [];

        /** @member {UIElement} - parent of this element */
        this.parent = null;

        /** @member {[UIElement]} - array of sibling elements */
        this.siblings = [];

        this.addAttributes(attrs);
        this.addAttribute('id', this.id);

        /** @member {string} - inner text of this element */
        this.text = '';
    }

    /**
     * Add an attribute, or set its value if it already exists
     * @param {string} name - attribute name
     * @param {string} value - attribute value
     */
    addAttribute(name, value) {
        this.addUIAttribute(new UIAttribute(name, value));
    }

    /**
     * Add an array of UIAttributes
     * @param {[UIAttribute]} arr - array of attributes
     */
    addAttributes(arr) {
        for (let a of arr) {
            this.addUIAttribute(a);
        }
    }

    /**
     * Add a child element and all of its siblings. Sets this element as the parent
     * @param {UIElement} element - the child element
     */
    addChild(element) {
        element.parent = this;
        this.children.push(element);
        for (let s of element.siblings) {
            this.addChild(s);
        }
    }

    /**
     * Add an array of child elements
     * @param {[UIElement]} arr - the child elements
     */
    addChildren(arr) {
        for (let c of arr) {
            this.addChild(c);
        }
    }

    /**
     * Add a class or classes to the existing list. Note that "class" is an attribute
     * @param {string} cl - whitespace-delimited list of classes
     */
    addClasses(cl) {
        let a = this.getClasses();
        if (! a) {
            this.setClass(cl);
            return;
        }
        let arr = a.value.split(/(\s+)/);
        let newArr = cl.split(/(\s+)/).filter((c) => {
            return arr.indexOf(c) < 0;
        });
        arr.push(...newArr);
        this.setClass(arr.join(' '));
    }

    /**
     * Add a sibling element. Requires this element to have a defined parent
     * @param {UIElement} element - the element to add
     * @throws - if this element has no parent
     */
    addSibling(element) {
        if (! this.parent) {
            throw new Error('Parent must be defined to add a sibling');
        }
        this.siblings.push(element);
        this.parent.addChild(element);
    }

    /**
     * Add or replace a UIAttribute
     * @param {UIAttribute} attr - attribute
     */
    addUIAttribute(attr) {
        this.attrs[attr.name] = attr;
    }

    /**
     * Remove all children
     */
    clearChildren() {
        this.children = [];
    }

    /**
     * Get an attribute by name, or null if none exists
     * @param {string} name - name of the attribute
     * @returns {UIAttribute} - attribute
     */
    getAttr(name) {
        return this.attrs[name];
    }

    /**
     * Get the child with the given id, or null if no such child exists
     * @param {string} id - the id of the child
     * @param {boolean} [recurse] - the id of the child
     * @returns {null|UIElement}
     */
    getChild(id, doRecurse=false) {
        for (let x of this.children) {
            if (x.id === id) {
                return x;
            }
            if (doRecurse) {
                const c = x.getChild(id, true);
                if (c) {
                    return c;
                }
            }
        }
        return null;
    }

    /**
     * Get the classes for this element as a UIAttribute
     * @returns {UIAttribute}
     */
    getClasses() {
        return this.getAttr('class');
    }

    /**
     * Get the jquery selector for the id of this element (that is '#<id>')
     * @returns {string} - the selector
     */
    getIdSelector() {
        return `#${this.id}`;
    }

    /**
     * Get the sibling with the given id, or null if no such sibling exists
     * @param id
     * @returns {null|UIElement}
     */
    getSibling(id) {
        for (let x of this.siblings) {
            if (x.id === id) {
                return  x;
            }
        }
        return null;
    }

    /**
     * Get the contents of the style attribute
     * @returns {null|UIStyle}
     */
    getStyle() {
        const s = this.getAttr('style');
        return s ? UIStyle.fromString(s.value) :  null;
    }

    /**
     * Get a specific style setting
     * @param {string} name - the name of the setting
     * @returns {null|{string}}
     */
    getStyleSetting(name) {
        return this.getStyle().getSetting(name);
    }

     /**
     * Hide this element - it remains in the DOM
     */
    hide() {
        $(this.getIdSelector()).hide();
    }

    /**
     * Remove the attribute with the given name
     * @param {string} name - the name of the attribute to remove
     */
    removeAttribute(name) {
        delete this.attrs[name];
    }

    /**
     * Remove the child with the given id
     * @param {string} id - the id of the child to remove
     */
    removeChild(id) {
        let c = this.getChild(id);
        if (c) {
            this.children.splice(this.children.indexOf(c), 1);
        }
    }

    /**
     * Remove the given class or classes from this element
     * @param {string} cl - whitespace-delimited list of classes
     */
    removeClasses(cl) {
        let a = this.getClasses();
        if (! a) {
            return;
        }
        let arr = a.value.split(/(\s+)/);
        let clArr = cl.split(/(\s+)/);
        for (let c of clArr) {
            let clIdx = arr.indexOf(c);
            if (clIdx >= 0) {
                arr.splice(clIdx, 1);
            }
        }
        this.setClass(arr.join(' '));
    }

    /**
     * Remove the sibling with the given id
     * @param {string} id - the id of the sibling to remove
     */
    removeSibling(id) {
        let s = this.getSibling(id);
        if (! s) {
            return;
        }
        this.siblings.splice(this.children.indexOf(s), 1);
        this.parent.removeChild(id);
    }

    /**
     * Remove a specific style setting
     * @param {string} name - the name of the setting
     */
    removeStyleSetting(name) {
        let s = this.getStyle();
        if (! s) {
            return;
        }
        s.removeSetting(name);
        this.setStyle(s);
    }

    /**
     * Set the existing attribute with the given name to the given value
     * @param {string} name - name of an existing attribute
     * @param {string} val - new value of the attrribute
     */
    setAttribute(name, val) {
        this.getAttr(name).setValue(val);
    }

    /**
     * Set the class attribute
     * @param {string} cl - whitespace-delimited list of classes
     */
    setClass(cl) {
        let a = this.getClasses();
        if (! a) {
            this.addAttribute('class', cl);
            return;
        }
        a.setValue(cl);
    }

    /**
     * Set the style, adding the attribute
     * @param {UIStyle} style - the style to set
     */
    setStyle(style) {
        this.addUIAttribute(style.toAttr());
    }

    /**
     * Set a specific style setting
     * @param {string} name - the name of the setting
     * @param {string} value - the value of the setting
     */
    setStyleSetting(name, value) {
        let s = this.getStyle() || new UIStyle();
        s.setSetting(name, value);
        this.setStyle(s);
    }

    /**
     * Set the text of this element
     * @param {string} text - text to set
     */
    setText(text) {
        this.text = text;  //this.encode(str);
    }

    /**
     * Show/hide this element
     */
    setVisible(isVisible) {
        if (isVisible) {
            this.show();
        }
        else {
            this.hide();
        }
    }

    /**
     * Show this element
     */
    show() {
        $(this.getIdSelector()).show();
    }

    /**
     * Return the provided id, or a unique (enough) id based on the element tag if null
     * @param {string} [id] - id value or null
     * @returns {string} - same id value or new unique id
     */
    srId(id) {
        return id ? id : `sr-${this.tag}-${Math.round(Number.MAX_SAFE_INTEGER * Math.random())}`;
    }

    /**
     * Get the DOM element for this UIElement. Note that this will be null if the element is not part of the document
     * @returns {HTMLElement} - the DOM element
     */
    toDOM() {
        return document.getElementById(this.id);
    }

    /**
     * Get the template string for this element
     * @returns {string} - the template string
     */
    toTemplate() {
        let t = this.tag;  //this.encode(this.tag);
        let s = `<${t} ${UIAttribute.attrsToTemplate(Object.values(this.attrs))}>`;
        s += this.text;
        for (let c of this.children) {
            s += c.toTemplate();
        }
        s += `</${t}>`;
        for (let c of this.siblings) {
            s += c.toTemplate();
        }
        return s;
    }

    /**
     * Use jquery to replace the existing element in the document with the current template.
     * Note that any listeners must be replaced
     */
    update() {
        $(`${this.getIdSelector()}`).replaceWith(this.toTemplate());
        for (let e in (this.listeners || {}) ) {
            this.toDOM().addEventListener(e, this.listeners[e]);
        }
    }
}

/**
 * HTML anchor <a>
 */
class UIAnchor extends UIElement {
    /**
     * @param {string} [id] - id for this element
     * @param {string} [href] - href
     * @param {title} [string] - title to display on hover
     */
    constructor(href=null, title='', {id, attrs}=UIElement.defaultKwargs()) {
        super('a', {id: id, attrs:attrs});
        this.setHref(href);
        this.setTitle(title);
    }

    setHref(href) {
        this.href = href;
        this.addAttribute('href', href);
    }

    setOnClick(fn) {
        SIREPO.DOM.UIInput.addListener(this, 'click', fn);
    }

    setTitle(title) {
        this.title = title;
        this.addAttribute('title', title);
    }
}


/**
 * Convenience class for <div> elements
 */
class UIDiv extends UIElement {
    /**
     *
     * @param {string} [id] - id for this div
     * @param {[UIAttribute]} [attrs] - attributes for this div
     */
    constructor({id, attrs}=UIElement.defaultKwargs()) {
        super('div', {id: id, attrs:attrs});
    }
}

/**
 * Div with warning text and class
 */
class UIWarning extends UIDiv {
    /**
     * @param {string} [id] - id for this warning
     * @param {string} msg - the warning message
     */
    constructor(msg, {id, attrs}=UIElement.defaultKwargs()) {
        attrs.push(new UIAttribute('class', 'sr-input-warning'));
        super({id: id, attrs:attrs});
        this.setMsg(msg);
    }

    /**
     * Set the message for this warning
     * @param {string} msg - the warning message
     */
    setMsg(msg) {
        this.text = msg;
    }
}

/**
 * Wrapper for html strings. No parsing (yet)
 */
class UIRawHTML {
    /**
     * @param {string} html - the html string
     */
    constructor(html) {
        this.html = html;
    }

    /**
     * @returns {string} - the html string
     */
    toTemplate() {
        return this.html;
    }
}

/**
 * Convenience class for images
 */
class UIImage extends UIElement {
    /**
     * @param {string} [id] - id for this image
     * @param {string} src - source for this image
     * @param {number} [width] - width in pixels. Omit to use the native width of the source
     * @param {number} [height] - height in pixels. Omit to use the native height of the source
     */
    constructor(src, width=0, height=0, {id, attrs}=UIElement.defaultKwargs()) {
        attrs.push(new UIAttribute('src', src));
        super('img', {id: id, attrs: attrs});
        if (width) {
            this.setWidth(width);
        }
        if (height) {
            this.setHeight(height);
        }
    }

    /**
     * Set the height of this image
     * @param {number} height - height in pixels
     */
    setHeight(height) {
        this.addAttribute('height', `${height}`);
    }

    /**
     * Set the size of this image
     * @param width
     * @param height
     */
    setSize(width, height) {
        this.setWidth(width);
        this.setHeight(height);
    }

    /**
     * Set the width of this image
     * @param {number} width - width in pixels
     */
    setWidth(width) {
        this.addAttribute('width', `${width}`);
    }

    /**
     * Set the source of this image
     * @param {string} src - source of this image
     */
    setSource(src) {
        this.setAttribute('src', src);
    }
}

/**
 * Convenience class for input elements. Includes static methods for getting DOM values for elements that
 * have them but are not <input> (e.g. <select>). Also includes a UIWarning for use in validation
 */
class UIInput extends UIElement {

    //TODO(mvk) - add these static methods to input-like objects in a simple way, so we don't have
    //to keep redefining them

    /**
     * Add a listener for an input-like element. The listener is stored in a dict keyed by event type
     * @param {UIElement} element- the element
     * @param {string} eventType - event type such as 'change'
     * @param {function} fn - the function to execute when seeing the event
     */
    static addListener(element, eventType, fn) {
        if (! element.listeners) {
            element.listeners = {};
        }
        element.listeners[eventType] = fn;
        element.toDOM().addEventListener(eventType, fn);
    }

    /**
     * Clean up after an element, useful for preventing memory leaks.
     * @param {UIElement} element - the element
     */
    static destroy(element) {
        for (let e in element.listeners) {
            UIInput.removeListener(e, element.listeners[e]);
        }
        element.listeners = null;
    }

    /**
     * Get the form for an input-like element
     * @param {UIElement} element - the element
     * @returns {*} - the form
     */
    static getForm(element) {
        return element.toDOM().form;
    }

    /**
     * Get the value for an input-like element
     * @param {UIElement} element - the element
     * @returns {*} - the value
     */
    static getValue(element) {
        return element.toDOM().value;
    }

    /**
     * Remove a listener for an input-like element. Note the event type and the function are required
     * @param {UIElement} element- the element
     * @param {string} eventType - event type such as 'change'
     * @param {function} fn - the function to execute when seeing the event
     */
    static removeListener(element, eventType, fn) {
        element.toDOM().removeEventListener(eventType, fn);
        delete element.listeners[eventType];
    }

    /**
     * @param {string} [id] - id for this input
     * @param {string} type - input type
     * @param {string} initVal - initial value for the input
     * @param {[UIAttribute]} attrs - element attributes
     */
    constructor(type, initVal, {id, attrs}=UIElement.defaultKwargs()) {
        super('input', {id: id, attrs: attrs});
        this.type = type;
        this.addAttribute('type', type);
        this.addAttribute('value', initVal);
        //TODO(mvk): figure out how to add siblings (element must exist in DOM so addSibling() here fails
        this.warning = new UIWarning();
    }

    /**
     * Add a listener for this element. The listener is stored in a dict keyed by event type
     * @param {string} eventType - event type such as 'change'
     * @param {function} fn - the function to execute when seeing the event
     */
    addListener(eventType, fn) {
        UIInput.addListener(this, eventType, fn);
    }

    /**
     * Clean up after this element, useful for preventing memory leaks.
     */
    destroy() {
        UIInput.destroy();
    }

    /**
     * Get the form for this element
     * @returns {*} - the form
     */
    getForm() {
        return UIInput.getForm(this);
    }

    /**
     * Get the value for thiis element
     * @returns {*} - the value
     */
    getValue() {
        return UIInput.getValue(this);
    }

    /**
     * Remove a listener for this element. Note the event type and the function are required
     * @param {string} eventType - event type such as 'change'
     * @param {function} fn - the function to execute when seeing the event
     */
    removeListener(eventType, fn) {
        UIInput.removeListener(this, eventType, fn);
    }

    /**
     * Set the onchange listener method
     * @param {function} fn - the method to invoke
     */
    setOnChange(fn) {
        this.addListener('change', fn);
    }

    /**
     * Set the oninput listener method
     * @param {function} fn - the method to invoke
     */
    setOnInput(fn) {
        this.addListener('input', fn);
    }

}

/**
 * <button> element
 */
class UIButton extends UIElement {
    constructor({id, attrs}=UIElement.defaultKwargs()) {
        super('button', {id: id, attrs:attrs});
    }

    /**
     * Add a listener for this element. The listener is stored in a dict keyed by event type
     * @param {string} eventType - event type such as 'change'
     * @param {function} fn - the function to execute when seeing the event
     */
    addListener(eventType, fn) {
        UIInput.addListener(this, eventType, fn);
    }

    /**
     * Clean up after this element, useful for preventing memory leaks.
     */
    destroy() {
        UIInput.destroy();
    }

    /**
     * Get the form for this element
     * @returns {*} - the form
     */
    getForm() {
        return UIInput.getForm(this);
    }

    /**
     * Get the value for thiis element
     * @returns {*} - the value
     */
    getValue() {
        return UIInput.getValue(this);
    }

    /**
     * Remove a listener for this element. Note the event type and the function are required
     * @param {string} eventType - event type such as 'change'
     * @param {function} fn - the function to execute when seeing the event
     */
    removeListener(eventType, fn) {
        UIInput.removeListener(this, eventType, fn);
    }
}

class UICheckbox extends UIInput {
    constructor(isChecked, {id, attrs}=UIElement.defaultKwargs()) {
        super('checkbox', isChecked, {id: id, attrs: attrs});
        this.setValue(isChecked);
    }

    // I don't know why but only jquery seems to get this value right
    getValue() {
        return $(this.getIdSelector())[0].checked;
    }

    setValue(isChecked) {
        if (isChecked) {
            this.addAttribute('checked', '');
        }
        else {
            this.removeAttribute('checked');
        }
        this.setAttribute('value', isChecked);
        this.update();
    }

    setOnChange(fn) {
        super.setOnChange(e => {
            // weird
            this.setValue(this.getValue());
            fn(e);
        });
    }

}

/**
 * <button> element that supports on and off states
 */
class UIToggleButton extends UIButton {
    constructor(props, {id, attrs}=UIElement.defaultKwargs()) {
        super({id: id, attrs: attrs});
        this.labels = props.labels;
        this.outlets = props.outlets;
        this.isOn = props.isOn;
        this.addClasses(props.classes);
    }

    setup() {
        this.addListener('click', this.toggle);
        this.update();
    }

    toggle() {
        this.isOn = ! this.isOn;
        this.update();
    }

    update() {
        this.setText(this.labels[this.isOn ? 1 : 0]);
        for (let o of this.outlets) {
            o.setVisible(this.isOn);
        }
        super.update();
    }

}

/**
 * UI representation of an enumeration
 */
class UIEnum extends UIElement {
    /**
    * Gets a set of properties for representing the enum as either a set of buttons or a dropdown menu
    *
    * @param {string} layout 'buttons' | 'dropdown'
    * @returns {dict} the associated properties
    */
    static ENUM_LAYOUT_PROPS(layout) {
        return {
            buttons: {
                inputClass: UIEnumButton,
                parentElement: 'div',
                elementClasses: 'btn-group',
                superclass: UIDiv,
            },
            dropdown: {
                inputClass: UIEnumOption,
                parentElement: 'select',
                elementClasses: 'form-control',
                superclass: UISelect,
            },
        }[layout];
    }

    /**
     * Determine a layout for an enum. For now just use number of entries
     * @param {SREnum} srEnum -
     * @returns {*}
     */
    static autoLayout(srEnum) {
        const lp = UIEnum.ENUM_LAYOUT_PROPS;
        return srEnum.entries.length < 4 ? lp('buttons') : lp('dropdown');
    }

    /**
     * Create an enum with no entries - useful for dynamic UI
     * @param {string} name - name of this enum
     * @param {string} layout - layout type ('button'|'dropdown')
     * @returns {UIEnum} - the empty enum
     */
    static empty(name, layout) {
        return new UIEnum(
            new SIREPO.APP.SREnum(name, []),
            layout
        );
    }

    /**
     * @param {SREnum} srEnum - enum model
     * @param {string} layout - layout type ('button'|'dropdown')
     */
    constructor(srEnum, layout, {id, attrs}=UIElement.defaultKwargs()) {
        let props = layout ? UIEnum.ENUM_LAYOUT_PROPS(layout) : UIEnum.autoLayout(srEnum);
        super(props.parentElement, `sr-${SIREPO.UTILS.camelToKebabCase(srEnum.name)}`);
        this.srEnum = srEnum;
        this.layout = layout;
        this.layoutProps = props;
        this.addClasses(props.elementClasses);
        for (let e in srEnum.entries) {
            this.addChild(new props.inputClass(null, e));
        }
    }

    /**
     * Add a listener for this element. The listener is stored in a dict keyed by event type
     * @param {string} eventType - event type such as 'change'
     * @param {function} fn - the function to execute when seeing the event
     */
    addListener(eventType, fn) {
        UIInput.addListener(this, eventType, fn);
    }

    /**
     * Clean up after this element, useful for preventing memory leaks.
     */
    destroy() {
        UIInput.destroy(this);
    }

    /**
     * Get the form for this element
     * @returns {*} - the form
     */
    getForm() {
       return UIInput.getForm(this);
    }

    /**
     * Get the value for this element
     * @returns {*} - the value
     */
    getValue() {
        return UIInput.getValue(this);
    }

    /**
     * Set the enum entries
     * @param {Object<string:SREnumEntry>} schEntries - dict of enum entries, keyed by name
     */
    setEntries(schEntries) {
        this.clearChildren();
        this.srEnum.setEntries(schEntries);
        for (let e in this.srEnum.entries) {
            this.addChild(new this.layoutProps.inputClass(null, this.srEnum.entries[e]));
        }
    }


    /**
     * Set the onchange listener method
     * @param {function} fn - the method to invoke
     */
    setOnChange(fn) {
        this.addListener('change', fn);
    }

    /**
     * Set the DOM value
     * @param {*} v - the value
     */
    setValue(v) {
        this.toDOM().value = v;
    }

}

/**
 * A <button> built from an SREnumEntry
 */
class UIEnumButton extends UIElement {
    /**
     * @param {SREnumEntry} enumItem -
     */
    constructor(enumItem, {id, attrs}=UIElement.defaultKwargs()) {
        //TODO(mvk): excise angularJS stuff
        let v = `${enumItem.value}`;
        attrs.push(
            new UIAttribute('class', 'btn sr-enum-button'),
            new UIAttribute('data-ng-click', `model[field] = '${v}'`),
            new UIAttribute(
                'data-ng-class',
                `{'active btn-primary': isSelectedValue('${v}'), 'btn-default': ! isSelectedValue('${v}')}`
            ),
        )
        super('button', {id: id, attrs: attrs});
        this.setText(`${enumItem.label}`);
    }
}

/**
 * Convenience class for a <select> element
 */
class UISelect extends UIElement {
    /**
     * @param {string} [id] - id for this select
     * @param {[UIAttribute]} attrs - attributes for this select
     * @param {[UISelectOption]} options - option elements for this select
     */
    constructor(options=[], {id, attrs}=UIElement.defaultKwargs()) {
        super('select', {id: id, attrs: attrs});
        this.addOptions(options);
    }

    /**
     * Add an option to this select
     * @param {UISelectOption} o - the option
     */
    addOption(o) {
        this.addChild(o);
    }

    /**
     * Add an array of options to this select
     * @param {[UISelectOption]} arr - the options
     */
    addOptions(arr) {
        this.addChildren(arr);
    }
}


/**
 * Convenience class for an <option> element
 */
class UISelectOption extends UIElement {
    /**
     * @param {string} [id] - id for this option
     * @param {string} label - label for this option
     * @param {*} value - value of this option
     */
    constructor(label, value, {id, attrs}=UIElement.defaultKwargs()) {
        attrs.push(
            new UIAttribute('label', label),
            new UIAttribute('value', value),
        )
        super('option', {id: id, attrs: attrs});
    }
}

/**
 * An <option> element built from an SREnumEntry
 */
class UIEnumOption extends UISelectOption {
    /**
     * @param id
     * @param enumItem
     */
    constructor(enumItem, {id, attrs}=UIElement.defaultKwargs()) {
        super(enumItem.label, enumItem.value, {id: id, attrs: attrs});
    }
}

/**
 * <table> element with fixed number of columns
 */
class UITable extends UIElement {
    /**
     * @param {string} [id] - id for this div
     * @param {[UIAttribute]} [attrs] - attributes for this div
     * @param {number} numCols - number of columns
     */
    constructor(numCols=1, {id, attrs}=UIElement.defaultKwargs()) {
        super('table', {id: id, attrs: attrs});
        this.numCols = numCols;
        this.colGroup = new UIElement('colgroup');
        this.addChild(this.colGroup);
        for (let i = 0; i < this.numCols; ++i) {
            this.colGroup.addChild(new UIElement('col'));
        }
        this.head = new UIElement('thead');
        this.addChild(this.head);
        this.headerRow = new UIElement('tr');
        this.head.addChild(this.headerRow);
        this.setHeader();
        this.body = new UIElement('tbody');
        this.addChild(this.body);
    }

    /**
     * Add a row with the given text at the given position. Since the number of columns is fixed,
     * this uses only the first numCols entries.
     * @param {[string|UIElement]} textOrElementArr - array of text or elements for each column
     */
    addRow(textOrElementArr=[]) {
        let r = new UIElement('tr');
        this.applyArrayToCols(textOrElementArr, (x, i) => {
            const td = new UIElement('td');
            r.addChild(td);
            const c = x || '';
            if (c instanceof UIElement) {
                td.addChild(c);
            }
            else {
                td.setText(c);
            }
        });
        this.body.addChild(r);
    }

    /**
     * We often take an array to do something for each column. This invokes a function for each item in the
     * array until we get to the end, or we reach the end of the columns, whichever comes first
     * @param {[*]} arr - array of items
     * @param {function} fn - the function to invoke. It must accept at least an item and an index
     */
    applyArrayToCols(arr, fn) {
        for (let i = 0; i < Math.min(this.numCols, arr.length); ++i) {
            fn(arr[i], i);
        }
    }

    /**
     * Remove all (body) rows from this table
     */
    clearRows() {
        this.body.clearChildren();
        this.update();
    }

    /**
     * Remove the row at the given index
     * @param index
     */
    removeRowAt(index) {
        this.body.children.splice(index, 1);
    }


    /**
     * Get the cell (<td>) at the given index
     * @return {UIElement} - the row
     */
    getCell(i, j) {
        return this.getRow(i).children.filter(c => {
            return c.tag === 'td';
        })[j];
    }

    /**
     * Get the rows from this table
     * @return {UIElement} - the rows for this table
     */
    getRow(i) {
        return this.getRows()[i];
    }

    /**
     * Get the rows from this table
     * @return {[UIElement]} - the rows for this table
     */
    getRows() {
        return this.body.children.filter(c => {
            return c.tag === 'tr';
        });
    }

    /**
     * Get the rows from this table
     * @return {[UIElement]} - the rows for this table
     */
    getNumRows() {
        return this.getRows().length;
    }

    /**
     * Set the style attributes for each column
     * @param {[string]} styles - array of style strings
     */
    setColumnStyles(styles) {
        this.applyArrayToCols(styles, (x, i) => {
            this.colGroup.children[i].addAttribute('style', x);
        });
    }

    /**
     * Set the header text for each column. Since the number of columns is fixed, this uses only the first
     * numCols entries.
     * @param {[string]} text - array of strings to use as the header
     */
    setHeader(text=[]) {
        this.headerRow.clearChildren();
        this.applyArrayToCols(text, (x, i) => {
            const th = new UIElement('th');
            th.setText(x);
            this.headerRow.addChild(th);
        });
    }


}

/**
 * An <svg> element with given size
 */
class SVGContainer extends UIElement {
    /**
     * @param {string} [id] - id for this container
     * @param {number} width - container width
     * @param {number} height - container height
     */
    constructor(width, height, {id, attrs}=UIElement.defaultKwargs()) {
        attrs.push(
            new UIAttribute('width', `${width}`),
            new UIAttribute('height', `${height}`),
        )
        super('svg', {id: id, attrs: attrs});
    }

    d3Self() {
        return SVGContainer.d3Select(this.getIdSelector());
    }

}

/**
 * A <g> element
 */
class SVGGroup extends UIElement {
    /**
     * @param {string} [id] - id for this group
     */
    constructor({id, attrs}=UIElement.defaultKwargs()) {
        super('g', {id: id, attrs: attrs});
    }
}

/**
 * A <path> element defined by an array of points
 */
class SVGPath extends UIElement {
    /**
     * @param {string} [id] - id for this path
     * @param {[[number, number]]} points - points making up this path
     * @param {[number, number]} offsets - offsets from the origin of the svg canvas
     * @param {boolean} doClose - whether to automatically close the path
     * @param {string} strokeColor - hex value (#rrggbb) of the stroke color or 'none'
     * @param {string} fillColor - hex value (#rrggbb) of the fill color or 'none'
     */
    constructor(points, offsets=[0, 0], doClose=false, strokeColor='black', fillColor='none', {id, attrs}=UIElement.defaultKwargs()) {
        attrs.push(
            new UIAttribute('d', ''),
            new UIAttribute('fill', fillColor),
            new UIAttribute('stroke', strokeColor),
        );
        super('path', {id: id, attrs: attrs});
        this.doClose = doClose;
        this.fillColor = fillColor;
        this.offsets = offsets;
        this.points = points;
        this.strokeColor = strokeColor;

        /** @member {[[number, number]]} - path points including offsets */
        this.corners = [];

        /** @member {[[number, number], [number,  number]]} - line segements connecting corners */
        this.lines = [];

        /** @member {[number, number]} - scale factor in each direction */
        this.scales = [1.0, 1.0];

        this.update();
    }

    /**
     * Find the corner closest to the given coordinates
     * @param {number} x - x position
     * @param {number} y - y position
     * @returns {null|[number, number]} - the closest corner or null if none found
     */
    closestCorner(x, y) {
        let d = Number.MAX_VALUE;
        let closest = null;
        for (let c of this.corners) {
            let d2 = (c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y);
            if (d2 < d) {
                d = d2;
                closest = c;
            }
        }
        return closest;
    }

    /**
     * Find the lines containing the corner closest to the given coordinates
     * @param {number} x - x position
     * @param {number} y - y position
     * @returns {[[number, number], [number,  number]]} - the closest lines
     */
    closestLines(x, y) {
        return this.linesWithCorner(this.closestCorner(x, y));
    }

    /**
     * Get the lines that include the given corner
     * @param {[number, number]} c - the corner of interest
     * @returns {[[number, number], [number,  number]]} - the lines
     */
    linesWithCorner(c) {
        let lines = [];
        for (let l of this.lines) {
            if (l[0] == c || l[1] == c) {
                lines.push(l);
            }
        }
        return lines;
    }

    /**
     * Scale and offset the given point
     * @param {[number, number]} p - point
     * @returns {[number, number]} - scaled and offset point
     */
    pathPoint(p) {
        return [0, 1].map(j => this.offsets[j] + this.scales[j] * p[j]);
    }

    /**
     * Scale and offset the point at the given index
     * @param {number} i - point index
     * @returns {[number, number]} - scaled and offset point
     */
    pathPointAt(i) {
        return this.pathPoint(this.points[i]);
    }

    /**
     * Scaled and offset points
     * @returns {[[number, number]]} - scaled and offset points
     */
    pathPoints() {
        return this.points.map(p => this.pathPoint(p));
    }

    /**
     * The string assigned to the 'd' attrribute
     * @returns {string} - the string
     */
    pathString() {
        let c = this.pathPointAt(0);
        this.corners = [c];
        this.lines = [];
        let p = `M${c[0]},${c[1]} `;
        for (let i = 1; i < this.points.length; ++i) {
            c = this.pathPointAt(i);
            this.lines.push([c, this.corners[this.corners.length - 1]]);
            this.corners.push(c);
            p += `L${c[0]},${c[1]} `;
        }
        if (this.doClose) {
            this.lines.push([this.corners[this.corners.length - 1], this.corners[0]]);
            p += 'z';
        }
        return p;
    }


    /**
     * Set the fill color
     * @param {string} color - hex value (#rrggbb) of the fill color or 'none'
     */
    setFill(color) {
        this.fillColor = color;
        this.setAttribute('fill', this.fillColor);
    }

    /**
     * Set the offsets of this path in each direction
     * @param {[number, number]} offsets - the offsets
     */
    setOffsets(offsets) {
        this.offsets = offsets;
    }

    /**
     * Set the scale of this path in each direction
     * @param {[number, number]} scales - the scales
     */
    setScales(scales) {
        this.scales = scales;
    }

    /**
     * Set the stroke color
     * @param {string} color - hex value (#rrggbb) of the stroke color or 'none'
     */
    setStroke(color) {
        this.strokeColor = color;
        this.setAttribute('stroke', this.strokeColor);
    }

    /**
     * Update the path with the current params
     */
    update() {
        this.setAttribute('d', this.pathString());
        //super.update();  // ???
    }

}

/**
 * A <rect> element
 */
class SVGRect extends UIElement {
    /**
     *
     * @param {string} [id] - id for this rect
     * @param {number} x - origin x
     * @param {number} y - origin y
     * @param {number} width - width of this rect
     * @param {number} height - height of this rect
     * @param {string} style - css style string
     * @param {boolean} doRound - whether to round the corners of this rect
     */
    constructor(x, y, width, height, style, doRound, {id, attrs}=UIElement.defaultKwargs()) {
        super('rect', {id: id, attrs: attrs});
        if (doRound) {
            this.addAttributes([
                new UIAttribute('rx', 4),
                new UIAttribute('ry', 4),
            ]);
        }
        this.update(x, y, width, height, style);
    }

    /**
     * Update this rect with the current params
     * @param {number} x - origin x
     * @param {number} y - origin y
     * @param {number} width - width of this rect
     * @param {number} height - height of this rect
     * @param {string} style - css style string
     */
    update(x, y, width, height, style) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.style = style;
        for (let n of ['x', 'y', 'width', 'height', 'style']) {
            this.addAttribute(n, this[n]);
        }
        //super.update();  // ???
    }

}


/**
 * Square button with an SVG canvas for drawing shapes
 */
class SVGShapeButton extends UIElement {
    /**
     * @param {string} [id] - id for this button
     * @param {number} size - size of this button
     * @param {string} onclick - name of method to call on button click
     */
    constructor(size, onclick, {id, attrs}=UIElement.defaultKwargs()) {
        attrs.push(
            new UIAttribute('data-ng-click', `${onclick}()`)
        );
        //TODO(mvk) - remove angular, use listener
        super('button', {id: id, attrs: attrs});
        this.svg = new SVGContainer(`${id}-svg`, size, size);
        this.addChild(this.svg);

        /** @member {SVGPath} - shape to display */
        this.shape = null;
    }

    setShape(s) {
        this.shape = s;
        $(`${this.svg.getIdSelector()}`).html(this.shape.toTemplate());
    }
}

/**
 * SVG text element
 */
class SVGText extends UIElement {
    /**
     * @param {string} [id] - id of this text
     * @param {number} x - origin x
     * @param {number} y - origin y
     * @param {string} text - text to set
     */
    constructor(x, y, text = '', {id, attrs}=UIElement.defaultKwargs()) {
        attrs.push(
            new UIAttribute('x', `${x}`),
            new UIAttribute('y', `${y}`),
        )
        super('text', {id: id, attrs: attrs});
        this.setText(text);
    }
}

/**
 * A table with a fixed number of rows and columns rendered in SVG
 */
class SVGTable extends SVGGroup {
    /**
     * @param {string} [id] - id of this table
     * @param {number} x - origin x
     * @param {number} y - origin y
     * @param {number} cellWidth - width of a cell
     * @param {number} cellHeight - height of a cell
     * @param {number} cellPadding - padding around the text inn a cell
     * @param {number} numRows - number of rows
     * @param {number} numCols- number of rows
     * @param {string} borderStyle - CSS style of this table's border
     * @param {boolean} doRoundBorder - whether to round the corners of this table
     * @param header
     */
    constructor(x, y, cellWidth, cellHeight, cellPadding, numRows, numCols, borderStyle, doRoundBorder, header, {id, attrs}=UIElement.defaultKwargs()) {
        if (! numCols || ! numRows) {
            throw new Error(`Table must have at least 1 row and 1 column (${numRows} x ${numCols} given)`);
        }
        super({id: id, attrs: attrs});
        this.border = new SVGRect(this.borderId(), x, y, 0, 0, borderStyle, doRoundBorder);
        this.borderStyle = borderStyle;
        this.cellWidth = cellWidth;
        this.cellHeight = cellHeight;
        this.headerOffset = header.length ? cellHeight : 0;
        this.numRows = numRows;
        this.numCols = numCols;
        this.padding = cellPadding;
        this.x = x;
        this.y = y;

        for (let j = 0; j < header.length; ++j) {
            this.addChild(new SVGRect(
                null,
                x + j * cellWidth,
                y,
                cellWidth,
                cellHeight,
                'stroke:lightgrey; fill:lightgrey',
                true
            ));
            let hdr = new SVGText(
            `${this.id}-header`,
                x + j * cellWidth + this.padding,
                y + cellHeight - this.padding,
                header[j]
            );
            hdr.addAttribute('font-weight', 'bold');
            this.addChild(hdr);
        }
        for (let i = 0; i < numRows; ++i) {
            for (let j = 0; j < numCols; ++j) {
                this.addChild(new SVGRect(
                    this.cellBorderId(i, j),
                    x + j * cellWidth,
                    y + this.headerOffset + i * cellHeight,
                    cellWidth,
                    cellHeight,
                    'stroke:black; fill:none',
                    false
                ));
                this.addChild(new SVGText(
                    this.cellId(i, j),
                    x + j * cellWidth + this.padding,
                    y + this.headerOffset + cellHeight + i * cellHeight - this.padding
                ));
            }
        }

        // add border last so it covers edges
        this.addChild(this.border);
        this.update(x, y);
    }

    /**
     * Id for the border
     * @returns {string} - border id
     */
    borderId() {
        return `${this.id}-border`;
    }

    /**
     * Id for a cell at the given indices
     * @param {number} i - x index
     * @param {number} j - y index
     * @returns {string} - cell id
     */
    cellId(i, j) {
        return `${this.id}-${i}-${j}`;
    }

    /**
     * Id for the border df a cell at the given indices
     * @param {number} i - x index
     * @param {number} j - y index
     * @returns {string} - cell border id
     */
    cellBorderId(i, j) {
        return `${this.cellId(i, j)}-border`;
    }

    /**
     * Get the DOM for the cell at the given indices
     * @param {number} i - x index
     * @param {number} j - y index
     * @returns {*|jQuery|HTMLElement} - the cell DOM
     */
    getCell(i, j) {
        return $(`#${this.cellId(i, j)}`);
    }

    /**
     * Get the DOM for the cell border at the given indices
     * @param {number} i - x index
     * @param {number} j - y index
     * @returns {*|jQuery|HTMLElement} - the cell border DOM
     */
    getCellBorder(i, j) {
        return $(`#${this.cellBorderId(i, j)}`);
    }

    /**
     * Set properties of the cell at the given indices
     * @param {number} i - x index
     * @param {number} j - y index
     * @param {string} val - text in this cell
     * @param {string} color - hex value (#rrggbb) of the cell background color or 'none'
     * @param {number} opacity - opacity (0 - 1) of the cell background
     * @param {number} borderWidth - border width of this cell
     */
    setCell(i, j, val, color=null, opacity=0.0, borderWidth=1.0) {
        let cid  = this.cellId(i, j);
        let c = this.getChild(cid);
        this.getChild(this.cellId(i, j)).setText(val);
        this.getCellBorder(i, j).css('fill', color).css('fill-opacity', opacity).css('stroke-width', borderWidth);
    }

    /**
     * Set the border style of this table
     * @param {string} style - CSS style string
     */
    setBorderStyle(style) {
        this.borderStyle = style;
        this.update(this.x, this.y);
    }

    /**
     * Update this table with the latest params
     * @param {number} x - origin x
     * @param {number} y - origin y
     */
    update(x, y) {
        this.border.update(
            x,
            y,
            this.numCols * this.cellWidth,
            this.headerOffset + this.numRows * this.cellHeight,
            this.borderStyle
        );
        super.update();  // ???
    }

}

SIREPO.DOM = {
    SVGContainer: SVGContainer,
    SVGGroup:SVGGroup,
    SVGPath: SVGPath,
    SVGRect: SVGRect,
    SVGShapeButton: SVGShapeButton,
    SVGTable: SVGTable,
    SVGText: SVGText,
    UIAnchor: UIAnchor,
    UIAttribute: UIAttribute,
    UIButton: UIButton,
    UICheckbox: UICheckbox,
    UIToggleButton: UIToggleButton,
    UIDiv: UIDiv,
    UIElement: UIElement,
    UIEnum: UIEnum,
    UIEnumOption: UIEnumOption,
    UIImage: UIImage,
    UIInput: UIInput,
    UIRawHTML: UIRawHTML,
    UISelect: UISelect,
    UISelectOption: UISelectOption,
    UITable: UITable,
    UIWarning: UIWarning,
};
