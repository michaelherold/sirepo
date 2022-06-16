'use strict';

// The following classes are here possibly temporarily to avoid race conditions in js file loading

/**
 * Panel heading with control for hiding/showing the underlying panel
 */
class SRPanelHeading extends SIREPO.DOM.UIDiv {

    static toggleButtonIconClass(isHidden) {
        return isHidden ? 'glyphicon-chevron-down' : 'glyphicon-chevron-up';
    }

    /**
     * @param {string} [id] - id for this div
     * @param {string} title - title to display
     * @param {[SRAnchorButton]} [controls] - control buttons for this heading
     */
    constructor(title, controls=null, {id, attrs}={id: null, attrs: []}) {
        super({id: id, attrs: attrs});
        this.title = new SIREPO.DOM.UIElement('span');
        this.title.addClasses('sr-panel-heading');
        this.setTitle(title);
        this.addChild(this.title);
        this.toggle = new SIREPO.DOM.UIDiv();
        this.toggle.addClasses('sr-panel-options pull-right');
        this.addChild(this.toggle);
        this.toggleButton = new SRAnchorButton(null, title);
        this.isHidden = true;
        this.toggleButton.icon.addClasses('sr-panel-heading glyphicon');
        this.doToggle();

        if (controls) {
            const d = new SIREPO.DOM.UIDiv();
            d.addClasses('sr-panel-options pull-right');
            this.addChild(d);
            for (let c of controls) {
                d.addChild(c);
            }
        }

    }

    setTitle(title) {
        this.title.setText(title);
    }

    doToggle() {
        this.isHidden = ! this.isHidden;
        this.toggleButton.setTitle(this.isHidden ? 'Show' : 'Hide');
        this.toggleButton.icon.removeClasses(SRPanelHeading.toggleButtonIconClass(this.isHidden));
        this.toggleButton.icon.addClasses(SRPanelHeading.toggleButtonIconClass(! this.isHidden));
    }

}

/**
 * An anchor (<a>) element with a child element instead of text
 */
class SRAnchorButton extends SIREPO.DOM.UIAnchor {
    constructor(href, title, icon=null, {id, attrs}={id: null, attrs: []}) {
        super(href, title, {id: id, attrs: attrs});
        this.icon = icon ? icon : new SIREPO.DOM.UIElement('span');
        this.addChild(this.icon);
    }

    setIcon(icon) {
        this.icon = icon;
    }
}

/**
 * Base panel class
 */
class SRPanel extends SIREPO.DOM.UIDiv {

    /**
     * @param {string} [id] - id for this panel
     * @param {string} title - title for this panel
     */
    constructor(title='', {id: id, attrs}={id: null, attrs: []}) {
        super({id: id, attrs: attrs});
        this.heading = new SRPanelHeading(title);
        this.heading.addClasses('clearfix');
        this.body = new SIREPO.DOM.UIDiv();
        this.body.addClasses('panel-body');
        this.addChild(this.body);

        // need heading's hide state to propagate
        // add content

    }

}

/**
 * A <div> encapsulating an editor
 */
class SREditor extends SRPanel {

    /**
     * @param {string} [id] - id for this div
     * @param {string} formType - basic|advanced
     */
    constructor(formType, isModal=false, {id, attrs}={id: null, attrs: []}) {
        super({id: id, attrs: attrs});
    }

}

/**
 * A <div> encapsulating a standard report
 */
class SRReport extends SRPanel {

    /**
     * @param {string} [id] - id for this div
     * @param {string} modelName - name of the model for this report
     */
    constructor(modelName, title='Report', {id, attrs}={id: null, attrs:[]}) {
        super(title, {id: id, attrs: attrs});
    }

}

/**
 * Plot report
 */
class SRPlotReport extends SRReport {


    /**
     * Common CSS classes
     * @returns {{string:string}} - cell id
     */
    static css()  {
        return {
            overlayData: 'sr-overlay-data',
            plotWindow: 'sr-plot-window',
            srPlot: 'sr-plot',
        };
    }

    /**
     * @param {string} [id] - id for this report
     * @param {string} modelName - name of the model for this report
     */
    constructor(modelName, title='Plot Report', {id, attrs}={id: null, attrs: []}) {
        super(modelName, title, {id: id, attrs: attrs});
        this.plot = new SIREPO.DOM.UIDiv({id: null, attrs: [
                new SIREPO.DOM.UIAttribute('data-model-name', modelName),
                new SIREPO.DOM.UIAttribute('data-report-id', 'reportId'),
            ]});
        this.plot.addClasses(SRPlotReport.css().srPlot);
        this.addChild(this.plot);
    }

    getSVG() {
        return this.toDOM().querySelector(`svg.${SRPlotReport.css().srPlot}`);
    }

}

/**
 * 3d report
 */
class SRReport3D extends SRPlotReport {
    /**
     * @param {string} [id] - id for this report
     * @param {string} modelName - name of the model for this report
     */
    constructor(modelName, {id, attrs}={id: null, attrs: []}) {
        super(modelName, {id: id, attrs: attrs});
        this.plot.addAttribute( 'data-plot3d', '');
    }
}

/**
 * Heatmap report
 */
class SRReportHeatmap extends SRPlotReport {
    /**
     * @param {string} [id] - id for this report
     * @param {string} modelName - name of the model for this report
     */
    constructor(modelName, title='Heatmap', {id, attrs}={id: null, attrs: []}) {
        super(modelName, {id: id, attrs: attrs});
        this.plot.addAttribute( 'data-heatmap', '');
    }

}

SIREPO.COMPONENTS = {
    SREditor: SREditor,
    SRReport: SRReport,
};

SIREPO.PLOTTING = {
    SRPlotCSS: SRPlotReport.css(),
    SRPlotReport: SRPlotReport,
    SRReport3D: SRReport3D,
    SRReportHeatmap: SRReportHeatmap,
};
