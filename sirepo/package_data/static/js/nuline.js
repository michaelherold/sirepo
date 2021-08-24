'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.app.config(() => {
    SIREPO.appFieldEditors += [
        '<div data-ng-switch-when="BeamlineSettings" class="col-sm-12">',
          '<div data-beamline-settings-table="" data-field="model[field]" data-field-name="field" data-model="model" data-model-name="modelName"></div>',
        '</div>',
        '<div data-ng-switch-when="BeamlineSetting" class="col-sm-12">',
          '<div data-beamline-setting-selector="" data-field="model[field]" data-field-name="field" data-model="model" data-model-name="modelName"></div>',
        '</div>',
    ].join('');
    // TODO(e-carlin): copied from madx
    SIREPO.appReportTypes = [
    ].join('');
});

SIREPO.app.factory('nulineService', function(appState) {
    const self = {};
    const mevToKg = 5.6096e26;
    const defaultFactor = 100;
    const elementaryCharge = 1.602e-19; // Coulomb


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


    function dataFileChanged() {
        requestSender.getApplicationData(
            {
                method: 'process_data_file',
                filename: appState.clone(appState.models.simulation.dataFile),
            },
            function(data) {
                srdbg('data from', appState.models.simulation.dataFile, data);
                let dataNames = data.header.split(/\s+/).filter((w) => {
                    return w != '#' && w != '';
                });
                srdbg('names', dataNames);
                appState.models.beamlineSettings.settings = dataNames;
                let dataVals = data.values;
                srdbg('vals', dataVals);
                appState.saveChanges('simulation');
            });
        /*
        requestSender.statelessCompute(
            appState,
            {
                method: 'process_data_file',
                filename: appState.clone(appState.models.simulation.dataFile)
            },
            function(data) {
                srdbg('data from', appState.models.simulation.dataFile, data);
            });

         */
    }

    function windowResize() {
        self.colClearFix = $window.matchMedia('(min-width: 1600px)').matches
            ? 6 : 4;
    }

    //TODO(pjm): init from template to allow listeners to register before data is received
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
    $scope.$on('dataFile.changed', dataFileChanged);
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


SIREPO.app.directive('beamlineSettingSelector', function(appState, nulineService, panelState, $scope) {
    let sel = new SIREPO.DOM.UISelect('', [
        new SIREPO.DOM.UIAttribute('data-ng-model', 'model[field]'),
    ]);

    srdbg("CLBSLDSDAS!!");
    return {
        restrict: 'A',
        scope: {
            field: '=',
            fieldName: '=',
            itemClass: '@',
            model: '=',
            modelName: '=',
            parentController: '=',
            object: '=',
        },
        template: [
            sel.toTemplate(),
        ].join(''),
        controller: function($scope, $element) {
            srdbg('BLS', $scope);
            sel.addOptions(appState.models.beamlineSettings.settings);
        },
    };

});

SIREPO.app.directive('beamlineSettingsTable', function(appState, nulineService, panelState) {

    return {
        restrict: 'A',
        scope: {
            field: '=',
            fieldName: '=',
            itemClass: '@',
            model: '=',
            modelName: '=',
            parentController: '=',
            object: '=',
        },

        template: [
            '<table class="table table-hover">',
              '<colgroup>',
                '<col style="width: 20ex">',
                '<col style="width: 20ex">',
              '</colgroup>',
              '<thead>',
                '<tr>',
                  '<th>Setting Name</th>',
                  '<th>Setting Value</th>',
                  '<th></th>',
                '</tr>',
              '</thead>',
             '<tbody>',
            '<tr>',
            '</tr>',
                '<tr data-ng-repeat="item in loadItems()">',
                    '<td data-model-field="" data-model-name=""></td>',
                    '<td>{{ item.value }}</td>',
                  '<td style="text-align: right">',
                    '<div class="sr-button-bar-parent">',
                        '<div class="sr-button-bar" data-ng-class="sr-button-bar-active" >',
                            ' <button data-ng-click="deleteItem(item, $index)" class="btn btn-danger btn-xs"><span class="glyphicon glyphicon-remove"></span></button>',
                        '</div>',
                    '<div>',
                  '</td>',
                '</tr>',
            '</tbody>',
            '</table>',
            '<button data-ng-click="addItem()" id="sr-new-bevel" class="btn btn-info btn-xs pull-right">Add Setting <span class="glyphicon glyphicon-plus"></span></button>',
        ].join(''),
        controller: function($scope, $element) {
            let isEditing = false;
            let itemModel = 'beamlineSetting';
            let watchedModels = [itemModel];

            $scope.items = [];
            $scope.nulineService = nulineService;
            $scope.selectedItem = null;

            function itemIndex(data) {
                return $scope.items.indexOf(data);
            }

            $scope.addItem = function() {
                let b = appState.setModelDefaults({}, itemModel);
                //$scope.editItem(b, true);
                appState.models.simulation.settings.push(b);
                appState.saveQuietly('simulation', () => {
                    $scope.loadItems();
                });
            };

            $scope.deleteItem = function(item) {
                var index = itemIndex(item);
                if (index < 0) {
                    return;
                }
                $scope.field.splice(index, 1);
                //appState.saveChanges($scope.modelName);
                appState.saveQuietly('simulation', $scope.loadItems);
            };

            $scope.editItem = function(item, isNew) {
                isEditing = ! isNew;
                $scope.selectedItem = item;
                appState.models[itemModel] = item;
                panelState.showModalEditor(itemModel);
            };

            $scope.getSelected = function() {
                return $scope.selectedItem;
            };

            $scope.loadItems = function() {
                //srdbg('LOAD ITEMS', appState.models.simulation);
                $scope.items = appState.models.simulation.settings;  //$scope.field;
                return $scope.items;
            };

            appState.whenModelsLoaded($scope, function() {

                $scope.$on('modelChanged', function(e, modelName) {
                    if (watchedModels.indexOf(modelName) < 0) {
                        return;
                    }
                    $scope.selectedItem = null;
                    if (! isEditing) {
                        $scope.field.push(appState.models[modelName]);
                        isEditing = true;
                    }
                    appState.saveChanges('simulation');
                });

                $scope.$on('cancelChanges', function(e, name) {
                    if (watchedModels.indexOf(name) < 0) {
                        return;
                    }
                    appState.removeModel(name);
                });

                $scope.loadItems();
            });

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

