'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

let appModel = new SRApp(SIREPO.APP_NAME, SIREPO.APP_SCHEMA);

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
        <div data-ng-switch-when="beamlineSettings" data-beamline-settings-table="" data-model-name="{{ modelKey }}"></div>
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
        let table = new SIREPO.DOM.UITable(null, [], 3);
        table.addClasses('table table-hover');
        table.setHeader([
            'Setting Name',
            'Setting Value',
            '',
        ]);
        table.setColumnStyles(['width: 20ex']);
        for (let s of appState.models.beamlineSettings.settings) {
            const i = new UIInput(null, 'text', s.value);
            const c = new UIInput(null, 'checkbox', '', [
                new UIAttribute('checked'),
            ]);
            table.addRow([s.name, i, c,])
        }
    }

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
        template: [
            '<div data-common-footer="nav"></div>',
            '<div data-import-dialog=""></div>',
        ].join(''),
    };
});

SIREPO.app.directive('appHeader', function(appState, panelState) {
    return {
	restrict: 'A',
	scope: {
            nav: '=appHeader',
	},
        template: [
            '<div data-app-header-brand="nav"></div>',
            '<div data-app-header-left="nav"></div>',
            '<div data-app-header-right="nav">',
              '<app-header-right-sim-loaded>',
		'<div data-sim-sections="">',
                  '<li class="sim-section" data-ng-class="{active: nav.isActive(\'beamline\')}"><a href data-ng-click="nav.openSection(\'beamline\')"><span class="glyphicon glyphicon-option-horizontal"></span> Beamline</a></li>',
		'</div>',
              '</app-header-right-sim-loaded>',
              '<app-settings>',
		//  '<div>App-specific setting item</div>',
              '</app-settings>',
              '<app-header-right-sim-list>',
                '<ul class="nav navbar-nav sr-navbar-right">',
                  '<li><a href data-ng-click="nav.showImportModal()"><span class="glyphicon glyphicon-cloud-upload"></span> Import</a></li>',
                '</ul>',
              '</app-header-right-sim-list>',
            '</div>',
	].join(''),
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
        requestSender.getApplicationData(
            {
                method: '_process_zip_file',
                filename: appState.clone(model[dataFileField]),
                model: $scope.modelName,
                field: dataFileField,
            },
            function(data) {
                appState.models.beamlineSettingsFileList.fileList = data;
                appState.saveChanges('beamlineSettingsFileList');
            });
    }

    $scope.$on('beamlineDataFile.changed', () => {
        // this model and the settings file selector are in the same view, so it will
        // get changed regardless of whether dataFile changed
        if (dataFile !== model[dataFileField]) {
            loadDataFile();
        }
        dataFile = model[dataFileField];
    });

});

SIREPO.app.directive('beamlineImageReport', function(appState, nulineService, panelState) {
    let rpt = new SIREPO.PLOTTING.SRReportHeatmap('sr-beamline-report', 'beamlineImageReport');
    let btn = new SIREPO.DOM.UIButton();
    btn.addClasses('btn btn-default');
    btn.setText('Hide Sample');
    
    return {
        restrict: 'A',
        scope: {
            modelName: '@',
        },
        template: [
            rpt.toTemplate(),
            btn.toTemplate(),
        ].join(''),
        controller: function ($scope, $element) {
            const model = appState.models[$scope.modelName];
            let zoom = null;

            $scope.$on('beamlineSettings.changed', () => {
                appState.saveChanges('beamlineImageReport');
            });

            let showSample = true;
            btn.addListener('click', () => {
                showSample = ! showSample;
                if (showSample) {
                    btn.setText('Show Sample');
                    $('#ml-sample').hide();
                }
                else {
                    btn.setText('Hide Sample');
                    $('#ml-sample').show();
                }
                btn.update();
            });

            function redraw() {
                srdbg('REDRAW');
            }

            $scope.$on('beamlineImageReport.summaryData', (e, d) => {
                // hard-coded offsets for the moment
                const tmpOffsets = [543.0, 437.25];
                const ns = 'http://www.w3.org/2000/svg';
                const sg = rpt.getSVG().querySelector('g');
                const r = sg.querySelector('rect');
                const g = document.createElementNS(ns, 'g');
                g.id = 'ml-sample';
                const confs = {'66':'red', '70':'blue', '90':'lightgreen'};
                // note reverse y
                // wait for ui to calculate scaling? - need plot scale so zoom works
                const scales = [
                    //r.getAttribute('width') / Math.abs((d.x_range[1] - d.x_range[0])),
                    //r.getAttribute('height') / Math.abs((d.y_range[1] - d.y_range[0])),
                    tmpOffsets[0] / Math.abs((d.x_range[1] - d.x_range[0])),
                    -tmpOffsets[1] / Math.abs((d.y_range[1] - d.y_range[0])),
                ];
                let t = '';
                let i = 1;
                for (let c in confs) {
                    const o = 0.1;  //0.75 * (i / 3.0);
                    const pts = d.sample[c];
                    const p = new SIREPO.DOM.SVGPath('ml-sample-90', pts, [0, tmpOffsets[1]], true, confs[c], confs[c]);
                    p.addAttribute('stroke-width', '2.0');
                    p.addAttribute('fill-opacity', `${o}`);
                    p.setScales(scales);
                    p.update();
                    t += p.toTemplate();
                    ++i;
                }
                g.innerHTML = t;
                sg.appendChild(g);
                
                //zoom = d3.behavior.zoom().on('zoom', redraw);
                //d3.select('#ml-sample').on('zoom', redraw);
            });


        },
    };
});

SIREPO.app.directive('beamlineSettingsTable', function(appState, nulineService, panelState, requestSender) {

    let table = new SIREPO.DOM.UITable(null, [], 3);
    table.addClasses('table table-hover');
    table.setHeader([
        'Setting Name',
        'Setting Value',
        '',
    ]);
    table.setColumnStyles(['width: 20ex']);

    return {
        restrict: 'A',
        scope: {
            modelName: '@',
        },

        template: [
            table.toTemplate(),
            //'<button data-ng-click="addItem()" id="sr-new-setting" class="btn btn-info btn-xs pull-right">Add Setting <span class="glyphicon glyphicon-plus"></span></button>',
        ].join(''),
        controller: function($scope, $element) {
            $scope.model = appState.models[$scope.modelName];
            $scope.nulineService = nulineService;

            const sss = [
                '2theta',
                'smpl_stk',
                'bottom_rot',
                's1',
                'slit_pre_bt',
                'slit_pre_rt',
                'slit_pre_tp',
                'slit_pre_lf',
                'stl',
                'stu',
                'z_stage',
                'vti',
                'robot'
            ]

            // this is where we need a link between model and view, so this gets done automatically
            function changeEl(e) {
                srdbg(e.target.id, e.target.value);
                const c = table.getChild(e.target.id, true);
                srdbg('c', c);
                
            }

            function loadSettings() {
                $scope.model.activeSettings = [];
                $scope.model.settings = [];
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
                        $scope.model.activeSettings = data.settings;
                        appState.models.beamlineImageReport.imageFile = data.imageFile;
                        appState.models.beamlineImageReport.imageSource = data.imageSource;
                        appState.models.beamlineImageReport.imageType = data.imageType;
                        appState.saveChanges([$scope.modelName, 'beamlineImageReport'], () => {
                            updateSettings();
                        })
                    });
            }

            function updateSettings() {
                const settings = $scope.model.activeSettings.filter(s => {
                    return sss.indexOf(s.name) >= 0;
                });
                table.clearRows();
                let numRows = 0;
                for (let s of settings) {
                    let i = new UIInput(null, 'text', s.value);
                    const c = new UIInput(null, 'checkbox', '', [
                        new UIAttribute('checked'),
                    ]);
                    table.addRow([s.name, i, c,]);
                    ++numRows;
                }
                table.update();
                // must wait to add listeners
                for (let i = 0; i < numRows; ++i) {
                    for (let j = 0; j < table.numCols; ++j) {
                        let c = table.getCell(i, j).children[0];
                        if (! c || ! c.getChild() instanceof UIInput) {
                            continue;
                        }
                        c.setOnInput(changeEl);
                    }
                }
            }

            $scope.$on('beamlineSettingsFile.changed', loadSettings);
            $scope.$on(`${$scope.modelName}.editor.show`, () => {
                srdbg('EDIT');

            });

            updateSettings();
        },
    };
});

SIREPO.viewLogic('beamlineSettingsView', function(appState, nulineService, panelState, $scope) {
    //$scope.watchFields = [
    //    'settings'
    //]
    // ;
    srdbg('beamlineSettingsView', $scope);

});

SIREPO.app.directive('beamlineSettingsFileSelector', function(appState, nulineService, panelState, $compile) {
    let sel = SIREPO.DOM.UIEnum.empty('beamlineSettingsFiles', 'dropdown');

    function updateSelector() {
        const f = appState.models.beamlineSettingsFileList.fileList;
        let e = Object.keys(f).sort().map((k) => {
            return [f[k], k];
        });
        sel.setEntries(e);
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
                sel.destroy();
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

