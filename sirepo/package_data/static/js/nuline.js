'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

let appModel = new SIREPO.APP.SRApp(SIREPO.APP_NAME, SIREPO.APP_SCHEMA);

SIREPO.app.config(() => {
    SIREPO.appFieldEditors += `
        <div data-ng-switch-when="BeamlineSettingsList" class="col-sm-12">
          <div data-beamline-settings-table="" data-field="field" data-model="model" data-model-name="modelName"></div>
        </div>
        <div data-ng-switch-when="FileList" class="col-sm-5">
          <div data-beamline-settings-file-selector="" data-field="field" data-model="model" data-model-name="modelName"></div>
        </div>
        `;
    SIREPO.appReportTypes = `
        <div data-ng-switch-when="beamlineImageReport" data-beamline-image-report="" data-model-name="{{ modelKey }}"></div>
        `;
    SIREPO.FILE_UPLOAD_TYPE = {
        'beamlineDataFile-dataFile': '.h5,.hdf5,.zip',
    };
});

SIREPO.app.factory('nulineService', function(appState) {
    const self = {};

    self.computeModel = () => 'animation';

    self.noOptimizationRunning = () => {
        return appState.models.simulationStatus
            && appState.models.simulationStatus.animation
            && ['pending', 'running'].indexOf(
                appState.models.simulationStatus.animation.state
            ) < 0;
    };

    appState.setAppService(self);
    return self;
});

SIREPO.app.controller('BeamlineController', function(appState, nulineService, frameCache, panelState, persistentSimulation, requestSender, $scope, $window) {
    const self = this;
    self.appState = appState;

    function windowResize() {
        self.colClearFix = $window.matchMedia('(min-width: 1600px)').matches
            ? 6 : 4;
    }

    self.getSettingsTable = (showAll) => {
        let table = new SIREPO.DOM.UITable(3);
        table.addClasses('table table-hover');
        table.setHeader([
            'Setting Name',
            'Setting Value',
            '',
        ]);
        table.setColumnStyles(['width: 20ex']);
        for (let s of appState.models.beamlineSettings.settings) {
            const i = new SIREPO.DOM.UIInput('text', s.value);
            const c = new SIREPO.DOM.UIInput('checkbox', '', {attrs: [
                new SIREPO.DOM.UIAttribute('checked'),
            ]});
            table.addRow([s.name, i, c,]);
        }
    };

    self.init = () => {
        if (! self.simState) {
            self.simState = persistentSimulation.initSimulationState(self);
            // wait for all directives to be initialized
        }
    };

    self.simHandleStatus = data => {
        if (! self.simState.isProcessing()) {
            //$scope.$broadcast('sr-latticeUpdateComplete');
        }
    };

    self.startSimulation = () => {
        appState.saveChanges('optimizerSettings', self.simState.runSimulation);
    };

    windowResize();
    $scope.$on('sr-window-resize', windowResize);
    $scope.$on('modelChanged', () => {});
    $scope.$on('cancelChanges', function(e, name) {
    });

    return self;
});

SIREPO.app.directive('appFooter', function(nulineService) {
    return {
        restrict: 'A',
        scope: {
            nav: '=appFooter',
        },
        template: `
            <div data-common-footer="nav"></div>
            <div data-import-dialog=""></div>
        `,
    };
});

SIREPO.app.directive('appHeader', function(appState, panelState) {
    return {
	    restrict: 'A',
	    scope: {
	        nav: '=appHeader',
	    },
        template: `
            <div data-app-header-brand="nav"></div>
            <div data-app-header-left="nav"></div>
            <div data-app-header-right="nav">
                <app-header-right-sim-loaded>
		            <div data-sim-sections="">
                        <li class="sim-section" data-ng-class="{active: nav.isActive(\'beamline\')}"><a href data-ng-click="nav.openSection(\'beamline\')"><span class="glyphicon glyphicon-option-horizontal"></span> Beamline</a></li>
		            </div>
                </app-header-right-sim-loaded>
                <app-settings></app-settings>
                <app-header-right-sim-list>
                    <ul class="nav navbar-nav sr-navbar-right">
                        <li><a href data-ng-click="nav.showImportModal()"><span class="glyphicon glyphicon-cloud-upload"></span> Import</a></li>
                    </ul>
                </app-header-right-sim-list>
            </div>
	    `,
    };
});



SIREPO.viewLogic('beamlineAutomationView', function(appState, nulineService, panelState, $scope) {

});

SIREPO.viewLogic('beamlineDataFileView', function(appState, nulineService, panelState, requestSender, $scope) {

    const model = appState.models[$scope.modelName];
    const dataFileField = 'dataFile';
    let dataFile = model[dataFileField];

    function loadDataFile() {
        appState.models.beamlineSettingsFileList.fileList = {};
        appState.models.beamlineSettingsFile.settingsFile = '';
        appState.models.beamlineImageReport.imageFile = '';
        ['beamlineSettingsFileList', 'beamlineSettingsFile', 'beamlineImageReport'].forEach(r => appState.saveQuietly);
        if (! model[dataFileField]) {
            return;
        }
        requestSender.getApplicationData(
            {
                method: '_process_zip_file',
                filename: appState.clone(model[dataFileField]),
                model: $scope.modelName,
                field: dataFileField,
            },
            function(data) {
                appState.models.beamlineSettingsFileList.fileList = data;
                appState.models.beamlineSettingsFile.settingsFile = data[0];
                appState.saveChanges(['beamlineSettingsFileList', 'beamlineSettingsFile']);
            });
    }

    $scope.$on('beamlineDataFile.changed', () => {
        // this model and the settings file selector are in the same view, so it will
        // get changed regardless of whether dataFile changed
        if (model[dataFileField] && dataFile !== model[dataFileField]) {
            loadDataFile();
        }
        dataFile = model[dataFileField];
    });

});

SIREPO.app.directive('beamlineImageReport', function(appState, panelState) {
    let rpt = new SIREPO.PLOTTING.SRReportHeatmap('beamlineImageReport', {id: 'sr-beamline-image-report', attrs:[]});
    let btn = new SIREPO.DOM.UIButton();
    btn.addClasses('btn btn-default');

    return {
        restrict: 'A',
        scope: {
            modelName: '@',
        },
        template: `
            ${rpt.toTemplate()}
            ${btn.toTemplate()}
        `,
        controller: function ($scope) {

            function canLoad()  {
                return appState.models.beamlineDataFile.dataFile &&
                    appState.models.beamlineSettingsFileList.fileList &&
                    appState.models.beamlineSettingsFile.settingsFile &&
                    appState.models[$scope.modelName].imageFile;
            }

            // not quite what I want - the whole panel should be hidden unless there is data
            function updateVisibility() {
                const panelHidden = panelState.isHidden($scope.modelName);
                if ((canLoad() && panelHidden) || (! canLoad() && ! panelHidden)) {
                    panelState.toggleHidden($scope.modelName);
                }
            }

            function updateSampleToggle()  {
                btn.setText(showSample ? 'Hide Sample': 'Show Sample');
                btn.update();
                $(`.${SIREPO.PLOTTING.SRPlotCSS.overlayData}`)[showSample ? 'show' : 'hide']();
            }

            $scope.$on('beamlineSettings.changed', () => {
                updateVisibility();
                appState.saveChanges('beamlineImageReport');
            });

            let showSample = true;
            updateVisibility();
            btn.hide();
            btn.addListener('click', () => {
                showSample = ! showSample;
                updateSampleToggle();
            });

            $scope.$on('beamlineImageReport.overlayData', () => {
                updateSampleToggle();
                btn.show();
            });

        },
    };
});

SIREPO.app.directive('beamlineSettingsTable', function(appState, nulineService, panelState, requestSender) {

    let table = new SIREPO.DOM.UITable(3);
    table.addClasses('table table-hover');
    table.setHeader([
        'Setting Name',
        'Setting Value',
        'Active',
    ]);
    table.setColumnStyles(['width: 20ex']);

    return {
        restrict: 'A',
        scope: {
            field: '=',
            modelName: '=',
        },

        template:`
            ${table.toTemplate()}
        `,
        controller: function($scope, $element) {
            const model = appState.models[$scope.modelName];
            $scope.model = model;
            $scope.nulineService = nulineService;

            // this is where we need a link between model and view, so this gets done automatically
            function changeEl(i) {
                return e => {
                    const c = table.getChild(e.target.id, true);
                    const f = {text: 'value', checkbox: 'isActive'}[c.type]
                    $scope.$apply(
                        $scope.model.settings[i][f] = c.getValue()
                    );
                }
                
            }

            function loadSettings() {
                model.settings = [];
                if (! appState.models.beamlineDataFile.dataFile) {
                    return;
                }
                requestSender.getApplicationData(
                    {
                        method: '_get_settings',
                        field: 'dataFile',
                        filename: appState.clone(appState.models.beamlineDataFile.dataFile),
                        model: 'beamlineDataFile',
                        path: appState.models.beamlineSettingsFile.settingsFile,
                        image_name_in_header: true,
                    },
                    function(data) {
                        model.settings = data.settings;
                        setDefaultActive();
                        appState.models.beamlineImageReport.imageFile = data.imageFile;
                        appState.models.beamlineImageReport.imageType = data.imageType;
                        appState.saveChanges([$scope.modelName, 'beamlineImageReport'], () => {
                            updateSettings();
                        });
                    });
            }

            function setDefaultActive() {
                for (const s of model.settings) {
                    s.isActive = SIREPO.APP_SCHEMA.constants.defaultActiveSettings.includes(s);
                }
            }

            function updateSettings() {
                table.clearRows();
                for (let i = 0; i < model.settings.length; ++i) {
                    const s = model.settings[i];
                    let n = new SIREPO.DOM.UIInput('text', s.value);
                    const c = new SIREPO.DOM.UICheckbox(s.isActive);
                    table.addRow([s.name, n, c,]);
                }
                table.update();
                // must wait until after update to add listeners
                for (let i = 0; i < model.settings.length; ++i) {
                    for (let j = 0; j < table.numCols; ++j) {
                        let c = table.getCell(i, j).children[0];
                        if (! c || ! (c instanceof SIREPO.DOM.UIInput)) {
                            continue;
                        }
                        if (c.type === 'text') {
                            c.setOnInput(changeEl(i));
                        }
                        if (c.type === 'checkbox') {
                            c.setOnChange(changeEl(i));
                        }
                    }
                }
            }

            $scope.$on('beamlineSettingsFileList.changed', setDefaultActive);
            $scope.$on('beamlineSettingsFile.changed', loadSettings);

            updateSettings();
        },
    };
});

SIREPO.viewLogic('beamlineSettingsView', function(appState, nulineService, panelState, $scope) {
});

SIREPO.app.directive('beamlineSettingsFileSelector', function(appState, nulineService, panelState, $compile) {
    let sel = SIREPO.DOM.UIEnum.empty('beamlineSettingsFiles', 'dropdown');

    function updateSelector() {
        const f = appState.models.beamlineSettingsFileList.fileList;
        let e = Object.keys(f).sort().map((k) => {
            return [f[k], k];
        });
        sel.setEntries(e);
        if (! sel.getValue()) {
            sel.setValue(e[0]);
        }
        sel.update();
    }

    return {
        restrict: 'A',
        scope: {
            field: '=',
            model: '=',
            modelName: '=',
        },
        template: [
            sel.toTemplate(),
        ].join(''),
        controller: function($scope, $element) {

            function selChanged() {
                $scope.$apply(
                    $scope.model[$scope.field] = sel.getValue()
                );
            }

            $scope.$on('beamlineSettingsFileList.saved', updateSelector);

            $scope.$on('$destroy', () => {
                //sel.destroy();
            });

            sel.setOnChange(selChanged);
            updateSelector();
            sel.setValue($scope.model[$scope.field]);
        },
    };

});

SIREPO.app.directive('optimizerTable', function(appState, panelState) {


    return {
        restrict: 'A',
        scope: {},
        template: [
            '<form name="form">',

              '<div class="form-group form-group-sm" data-model-field="\'method\'" data-form="form" data-model-name="\'optimizerSettings\'"></div>',


              '<table data-ng-show="appState.models.optimizerSettings.method == \'nmead\'" style="width: 100%; table-layout: fixed; margin-bottom: 10px" class="table table-hover">',
                '<colgroup>',
                  '<col style="width: 10em">',
                  '<col style="width: 20%>',
                  '<col style="width: 20%">',
                  '<col style="width: 20%">',
                '</colgroup>',
                '<thead>',
                  '<tr>',
                    '<th>Monitor Name</th>',
                    '<th data-ng-repeat="label in labels track by $index" class="text-center">{{ label }}</th>',
                  '</tr>',
                '</thead>',
                '<tbody>',
                  '<tr data-ng-repeat="target in appState.models.optimizerSettings.targets track by $index">',
                    '<td class="form-group form-group-sm"><p class="form-control-static">{{ target.name }}</p></td>',
                    '<td class="form-group form-group-sm" data-ng-repeat="field in fields track by $index">',
                      '<div data-ng-show="target.hasOwnProperty(field)">',
                        '<div class="row" data-field-editor="fields[$index]" data-field-size="12" data-model-name="\'optimizerTarget\'" data-model="target"></div>',
                      '</div>',
                    '</td>',
                  '</tr>',
                '</tbody>',
              '</table>',
            '</form>',
        ].join(''),
        controller: function($scope) {
            $scope.appState = appState;
            $scope.fields = ['x', 'y', 'weight'];
            $scope.labels = $scope.fields.map(f => SIREPO.APP_SCHEMA.model.optimizerTarget[f][0]);
            $scope.showField = (item, field) => field in item;
        },
    };
});

