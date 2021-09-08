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
        '<div data-ng-switch-when="FileList" class="col-sm-5">',
          '<div data-beamline-file-selector="" data-field="model[field]" data-field-name="field" data-model="model" data-model-name="modelName"></div>',
        '</div>',
    ].join('');
    SIREPO.appReportTypes = [
    ].join('');
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


SIREPO.app.directive('beamlineImage', function(appState, nulineService, panelState, $scope) {
    let img = new SIREPO.DOM.UIImage('sr-beamline-img');

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
            img.toTemplate(),
        ].join(''),
        controller: function($scope, $element) {
        },
    };

});


SIREPO.viewLogic('beamlineDataFileView', function(appState, nulineService, panelState, requestSender, $scope) {

    const model = appState.models[$scope.modelName];
    const dataFileField = 'dataFile';

    function loadDataFile() {
        appState.models.beamlineImageReport.imageFile = '';
        requestSender.getApplicationData(
            {
                method: '_process_zip_file',
                filename: appState.clone(model[dataFileField]),
                model: $scope.modelName,
                field: dataFileField,
            },
            function(data) {
                srdbg('beamline data', data);
                model.fileList = data;
                appState.saveQuietly($scope.modelName);
                appState.models.beamlineFileList.settingsFile = data[Object.keys(data)[0]];
                appState.saveChanges('beamlineFileList');
                //appState.models.beamlineSettings.settings = data.settings;
                //appState.models.beamlineImageReport.imageFile = data.img;
                //appState.saveChanges(['beamlineSettings', 'beamlineImageReport',]);
            });
    }

    $scope.$on('beamlineDataFile.changed', loadDataFile);
    //$scope.watchFields = [
    //    ['beamlineDataFile.dataFile',], dataFileChanged
    //];

});


SIREPO.viewLogic('beamlineImageReportView', function(appState, nulineService, panelState, $scope) {

    const model = appState.models[$scope.modelName];

    function updateImage() {
        srdbg('UPDATE IMG', model);
    }

    $scope.$on('beamlineImageReport.changed', updateImage);

});


SIREPO.app.directive('beamlineSettingSelector', function(appState, nulineService, panelState) {
    let sel = new SIREPO.DOM.UISelect('', [
        new SIREPO.DOM.UIAttribute('data-ng-model', 'model[field]'),
    ]);

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
            //srdbg(appState.models.beamlineSettings.settings);
            let opts = appState.models.beamlineSettings.settings.map(s => {
                return new SIREPO.DOM.UISelectOption(null, s.name, s.name);
            });
            srdbg(opts);
            sel.addOptions(opts);
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
                //'<col style="width: 20ex">',
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
                    '<td>{{ item.name }}</td>',
                    '<td><input type="text" data-ng-model="item.value"></td>',
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
            //'<button data-ng-click="addItem()" id="sr-new-setting" class="btn btn-info btn-xs pull-right">Add Setting <span class="glyphicon glyphicon-plus"></span></button>',
        ].join(''),
        controller: function($scope, $element) {
            let isEditing = false;
            let itemModel = 'beamlineSetting';
            let watchedModels = [itemModel];

            $scope.items = [];
            $scope.itemModel = 'beamlineSetting';
            $scope.itemField = 'name'
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
                return;
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
                $scope.items = appState.models[$scope.modelName].settings;
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

SIREPO.app.directive('beamlineFileSelector', function(appState, nulineService, panelState) {
    let sel = SIREPO.DOM.UIEnum.empty('beamlineFiles', 'dropdown');

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

            $scope.selector = sel;

            function updateSelector() {
                srdbg($scope.fieldName, 'FILES', $scope.model[$scope.fieldName]);
                const f = appState.models.beamlineDataFile.fileList || [];
                // just use SREnum directly?
                let e = Object.keys(f).map((k) => {
                    return [f[k], k];
                });
                sel.setEntries(e);
                sel.update();
            }

            $scope.$on('beamlineFileList.changed', () => {
                //srdbg('FILES', $scope.model[$scope.fieldName]);
                //updateSelector();
            });

            updateSelector();
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

