'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.app.config(() => {
    SIREPO.appFieldEditors = `
        <div data-ng-switch-when="FloatStringArray" class="col-sm-7">
            <div data-number-list="" data-model="model" data-field="model[field]" data-info="info" data-type="Float" data-count=""></div>
        </div>
        <div data-ng-switch-when="MadxSimList" data-ng-class="fieldClass">
          <div data-sim-list="" data-model="model" data-field="field" data-code="madx" data-route="lattice"></div>
        </div>
        <div data-ng-switch-when="MLModelFile" class="col-sm-7">
           <div data-file-field="field" data-file-type="ml" data-model="model" data-selection-required="false" data-empty-selection-text="None"></div>
        </div>
        <div data-ng-switch-when="MLConfigList" class="col-sm-12">
           <div data-ml-model-config=""  data-model="model" data-model-name="modelName" data-field="field"></div>
        </div>
        <div data-ng-switch-when="MLConfigFile" class="col-sm-7">
           <div data-file-field="field"  data-file-type="" data-model="model" data-selection-required="false" data-empty-selection-text="None"></div>
        </div>
    `;
    SIREPO.lattice = {
        elementColor: {
            BEAMLINE: 'lightblue',
            OCTUPOLE: 'yellow',
            QUADRUPOLE: 'purple',
            SEXTUPOLE: 'lightgreen',
            KICKER: 'black',
            HKICKER: 'black',
            VKICKER: 'black',
        },
        elementPic: {
            aperture: ['COLLIMATOR', 'ECOLLIMATOR', 'RCOLLIMATOR'],
            beamline: ['BEAMLINE'],
            bend: ['RBEND', 'SBEND'],
            drift: ['DRIFT'],
            lens: ['NLLENS'],
            magnet: ['HACDIPOLE', 'HKICKER', 'KICKER', 'MATRIX', 'MULTIPOLE', 'OCTUPOLE', 'QUADRUPOLE', 'RFMULTIPOLE', 'SEXTUPOLE', 'VACDIPOLE', 'VKICKER'],
            rf: ['CRABCAVITY', 'RFCAVITY', 'TWCAVITY'],
            solenoid: ['SOLENOID'],
            watch: ['INSTRUMENT', 'HMONITOR', 'MARKER', 'MONITOR', 'PLACEHOLDER', 'VMONITOR'],
            zeroLength: ['BEAMBEAM', 'CHANGEREF', 'DIPEDGE', 'SROTATION', 'TRANSLATION', 'XROTATION', 'YROTATION'],
        },
    };
    SIREPO.appReportTypes = `
        <div data-ng-switch-when="bpmMonitor" data-zoom="XY" data-bpm-monitor-plot="" class="sr-plot" data-model-name="{{ modelKey }}"></div>
        <div data-ng-switch-when="bpmHMonitor" data-zoom="X" data-bpm-monitor-plot="Horizontal" class="sr-plot" data-model-name="{{ modelKey }}"></div>
        <div data-ng-switch-when="bpmVMonitor" data-zoom="Y" data-bpm-monitor-plot="Vertical" class="sr-plot" data-model-name="{{ modelKey }}"></div>
    `;
});

SIREPO.app.factory('cebafService', function(appState) {
    const self = {};
    const mevToKg = 5.6096e26;
    const defaultFactor = 100;
    const elementaryCharge = 1.602e-19; // Coulomb
    const fieldMap = {
        QUADRUPOLE: 'K1',
        KICKER: 'KICK',
        HKICKER: 'KICK',
        VKICKER: 'KICK',
    };
    self.isReadoutTableActive = false;

    self.beamlineMargin = {
        x: 40,
        y: 0,
    };

    function beamInfo() {
        const beam = appState.applicationState().command_beam;
        let pInfo = SIREPO.APP_SCHEMA.constants.particleMassAndCharge[beam.particle];
        if (! pInfo) {
            pInfo = [beam.mass, beam.charge];
        }
        return {
            mass: pInfo[0] / mevToKg,
            charge: pInfo[1] * elementaryCharge,
            gamma: beam.gamma,
            beta: Math.sqrt(1 - (1 / (beam.gamma * beam.gamma))),
        };
    }

    function computeCurrent(kick, factor) {
        const b = beamInfo();
        return kick * b.gamma * b.mass * b.beta * SIREPO.APP_SCHEMA.constants.clight
            / (b.charge * factor);
    }

    function computeKick(current, factor) {
        const b = beamInfo();
        return current * b.charge * factor
            / (b.gamma * b.mass * b.beta * SIREPO.APP_SCHEMA.constants.clight);
    }

    function interpolateTable(value, tableName, fromIndex, toIndex) {
        const table = self.getAmpTables()[tableName];
        if (! table || table.length == 0) {
            return defaultFactor;
        }
        if (table.length == 1 || value < table[0][fromIndex]) {
            return table[0][toIndex];
        }
        let i = 1;
        while (i < table.length) {
            if (table[i][fromIndex] > value) {
                return (value - table[i-1][fromIndex]) / (table[i][fromIndex] - table[i-1][fromIndex])
                    * (table[i][toIndex] - table[i-1][toIndex]) + table[i-1][toIndex];
            }
            i += 1;
        }
        return table[table.length - 1][toIndex];
    }

    self.hasMadxLattice = () => ! ! appState.applicationState().externalLattice;

    self.buildReverseMap = (tableName) => {
        const table = self.getAmpTables()[tableName];
        if (table) {
            table.forEach((row) => row[2] = computeKick(row[0], row[1]));
        }
    };

    self.computeModel = () => 'animation';

    self.controls = () => {
        const l = self.latticeModels();
        if (! l) {
            return;
        }
        return l.beamlines[0].items
            .map(i => self.elementForId(i))
            .filter(e => Object.keys(SIREPO.APP_SCHEMA.constants.readoutElements).includes(e.type));
    };

    self.currentField = (kickField) => 'current_' + kickField;

    self.currentToKick = (model, kickField) => {
        const current = model[self.currentField(kickField)];
        if (! model.ampTable) {
            return computeKick(current, defaultFactor);
        }
        return computeKick(
            current,
            interpolateTable(current, model.ampTable, 0, 1));
    };

    self.fieldForCurrent = (modelName) => fieldMap[modelName];

    self.elementForId = function(id)  {
        return self.findInContainer('elements', '_id', id);
    };

    self.findInContainer = function(container, key, value) {
        let res;
        self.latticeModels()[container].some(m => {
            if (m[key] == value) {
                res = m;
                return true;
            }
        });
        if (! res) {
            throw new Error(`model not found for ${key}: ${value}`);
        }
        return res;
    };

    self.isKickField = (field) => field.search(/^(.?kick|k1)$/) >= 0;

    self.kickField = (currentField) => currentField.replace('current_', '');

    self.kickToCurrent = (model, kick) => {
        if (! model.ampTable) {
            return computeCurrent(kick, defaultFactor);
        }
        self.buildReverseMap(model.ampTable);
        return computeCurrent(
            kick,
            interpolateTable(kick, model.ampTable, 2, 1));
    };

    self.latticeModels = () => appState.models.externalLattice.models;

    appState.setAppService(self);
    return self;
});

SIREPO.app.controller('CEBAFBeamlineController', function(appState, cebafService, frameCache, latticeService, panelState, persistentSimulation, requestSender, $scope, $window) {
    const self = this;
    const STATUS_NOMINAL = 0;
    const STATUS_CAUTION = 1;
    const STATUS_FAULT = 2;
    const STATUS_IDLE = -1;
    const mlModelConfig = appState.models.mlModelConfig;
    const outputItems = mlModelConfig.configItems.filter(item => item.io.value === 'output');

    self.appState = appState;
    self.simScope = $scope;
    self.simAnalysisModel = 'dataServerAnimation';

    function buildBeamlineStatus(intialStatus) {
        return {
            elements: {},
            statusLevel: intialStatus,
            statusLevels: [0, 0, 0],
            time: Date.now() / 1000,
        };
    }

    function computeElementStatusLevel(variance, tolerance) {
        const v = Math.abs(variance);
        const t = Math.abs(tolerance);
        return v < mlModelConfig.elementStatusCautionFactor * t ? STATUS_NOMINAL :
            (v < mlModelConfig.elementStatusFaultFactor * t ? STATUS_CAUTION : STATUS_FAULT);
    }

    function computeBeamlineStatusLevel(elementLevels) {
        return elementLevels[STATUS_FAULT] > mlModelConfig.beamlineStatusFaultThreshold ? STATUS_FAULT :
            (elementLevels[STATUS_CAUTION] > mlModelConfig.elementStatusCautionFactor ? STATUS_CAUTION : STATUS_NOMINAL);
    }

    function dataFileChanged() {
        requestSender.sendStatefulCompute(
            appState,
            data => {
                appState.models.externalLattice = data.externalLattice;
                appState.saveChanges(['externalLattice']);
            },
            {
                method: 'get_external_lattice',
                simulationId: appState.models.dataFile.madxSirepo
            }
        );
    }

    function getBeamlineIds() {
        return cebafService.latticeModels().beamlines.map(x => x.id);
    }


    function resetStatusLevels() {
        if (! appState.models.beamlineStatus.current) {
            appState.models.beamlineStatus.current = {};
        }
        let blStatus = appState.models.beamlineStatus.current;
        for (const blId of getBeamlineIds()) {
            if (! blStatus[blId]) {
                blStatus[blId] = buildBeamlineStatus(STATUS_IDLE);
            }
            blStatus[blId].statusLevel = STATUS_IDLE;
            blStatus[blId].statusLevels = [0, 0, 0];
            for (const e in blStatus[blId].statusLevel.elements) {
                blStatus[blId].statusLevel.elements[e].statusLevel = STATUS_IDLE;
            }
        }
        appState.models.beamlineStatus.history = [];
    }

    function updateStatusLevels(history) {
        let blStatus = {};
        const h =  history[history.length - 1];
        const readings = h.outputReadings;
        for (const s in readings) {
            const r = readings[s];
            const c = outputItems.filter(item => item.setting.value === s)[0];
            const blId = getBeamlinesWhichContainId(
                latticeService.elementForName(c.element.value, appState.models.externalLattice.models)._id
            )[0];
            blStatus[blId] = buildBeamlineStatus(STATUS_NOMINAL);
            const l = computeElementStatusLevel(r.variance, c.tolerance.value);
            blStatus[blId].statusLevels[l] += 1;
            blStatus[blId].time = h.time;
            blStatus[blId].elements[c.element.value] = {
                value: parseFloat(r.value),
                prediction: parseFloat(r.prediction),
                statusLevel: l,
            };
        }
        for (const blId in blStatus) {
            blStatus[blId].statusLevel = computeBeamlineStatusLevel(blStatus[blId].statusLevels);
        }
        appState.models.beamlineStatus.current = blStatus;
        appState.models.beamlineStatus.history.push(blStatus);
        if (appState.models.beamlineStatus.history.length > appState.models.mlModelConfig.sessionHistoryLimit) {
            appState.models.beamlineStatus.history.shift();
        }
    }

    function windowResize() {
        self.colClearFix = $window.matchMedia('(min-width: 1600px)').matches
            ? 6 : 4;
    }

    function getBeamlinesWhichContainId(id) {
        let res = [];
        const bl = cebafService.latticeModels().beamlines;
        for (let i = 0; i < bl.length; i++) {
            const b = bl[i];
            if (b.items.map(item => Math.abs(item)).some(item => id === item)) {
                res.push(b.id);
            }
        }
        return res;
    }

    $scope.cebafService = cebafService;

    self.cancelCallback = () => $scope.$broadcast('sr-beamlineStatusComplete');

    self.simHandleStatus = data => {
        if (! self.simState.isStateRunning() || ! data.res || ! data.res.length || ! data.res[data.res.length - 1].outputReadings) {
            resetStatusLevels();
        }
        else {
            updateStatusLevels(data.res);
        }
        appState.saveChanges('beamlineStatus', () => {
            $scope.$broadcast('sr-beamlineStatusUpdate', appState.models.beamlineStatus);
        });
    };

    self.simState = persistentSimulation.initSimulationState(self);

    self.startSimulation = () => {
        self.simState.saveAndRunSimulation(['beamlineStatus', 'simulation']);
    };

    $scope.$on('dataFile.changed', dataFileChanged);

    windowResize();
    $scope.$on('sr-window-resize', windowResize);
    return self;
});

SIREPO.app.controller('CEBAFConfigController', function(appState, cebafService, frameCache, latticeService, panelState, persistentSimulation, requestSender, $scope, $window) {
    const self = this;
    self.appState = appState;
    self.simScope = $scope;

    function dataFileChanged() {
        requestSender.sendStatefulCompute(
            appState,
            data => {
                appState.models.externalLattice = data.externalLattice;
                appState.models.optimizerSettings = data.optimizerSettings;
                $.extend(appState.models.command_twiss, findExternalCommand('twiss'));
                $.extend(appState.models.command_beam, findExternalCommand('beam'));
                appState.saveChanges(['command_beam', 'command_twiss', 'externalLattice', 'optimizerSettings']);
                computeCurrent();
                appState.saveChanges('externalLattice');
            },
            {
                method: 'get_external_lattice',
                simulationId: appState.models.dataFile.madxSirepo
            }
        );
    }

    function findExternalCommand(name) {
        return cebafService.findInContainer('commands', '_type', name.replace('command_', ''));
    }

    function getInitialMonitorPositions() {
        if (self.simState && self.simState.isProcessing()) {
            // optimization is running
            return;
        }
        if (! appState.applicationState().externalLattice) {
            return;
        }
        cebafService.setReadoutTableActive(true);
        panelState.clear('initialMonitorPositionsReport');
        panelState.requestData(
            'initialMonitorPositionsReport',
            (data) => {
                cebafService.setReadoutTableActive(false);
                handleElementValues(data);
            },
            false,
            (err) => cebafService.setReadoutTableActive(false));
    }

    function handleElementValues(data) {
        if (! data.elementValues) {
            return;
        }
        frameCache.setFrameCount(1);
        updateKickers(data.elementValues);
        $scope.$broadcast('sr-elementValues', data.elementValues);
    }

    function modelDataForElement(element) {
        return {
            modelKey: 'el_' + element._id,
            title: element.name.replace(/\_/g, ' '),
            viewName: element.type,
            getData: () => element,
        };
    }

    function saveLattice(e, name) {
        if (name == name.toUpperCase()) {
            const m = appState.models[name];
            $.extend(cebafService.elementForId(m._id), m);
            appState.removeModel(name);
            appState.saveQuietly('externalLattice');
        }
        if (['command_beam', 'command_twiss'].includes(name)) {
            $.extend(findExternalCommand(name), appState.models[name]);
            appState.saveQuietly('externalLattice');
        }
    }

    function updateKickers(values) {
        if (! values.length) {
            return;
        }
        for (let k in values[values.length - 1]) {
            let mf = k.split('.');
            if (cebafService.isKickField(mf[1])) {
                const el = latticeService.elementForId(
                    mf[0].split('_')[1],
                    cebafService.latticeModels());
                el[mf[1]] = values[values.length - 1][k];
                el[cebafService.currentField(mf[1])] = cebafService.kickToCurrent(el, el[mf[1]]);
                if (appState.models[el._type] && appState.models[el._type]._id == el._id) {
                    appState.models[el._type] = el;
                }
            }
        }
        appState.saveQuietly('externalLattice');
    }

    function windowResize() {
        self.colClearFix = $window.matchMedia('(min-width: 1600px)').matches
            ? 6 : 4;
    }

    self.cebafService = cebafService;

    self.cancelCallback = () => $scope.$broadcast('sr-latticeUpdateComplete');

    $scope.$on('dataFile.changed', dataFileChanged);
    
    //TODO(pjm): init from template to allow listeners to register before data is received
    self.init = () => {
    };

    return self;
});

SIREPO.app.directive('appFooter', function(cebafService) {
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

SIREPO.app.directive('appHeader', function(cebafService, appState, panelState) {
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
                  <li class="sim-section" data-ng-class="{active: nav.isActive(\'config\')}"><a href data-ng-click="nav.openSection(\'config\')"><span class="glyphicon glyphicon-wrench"></span> Config</a></li>
                </div>
              </app-header-right-sim-loaded>
              <app-settings>
              </app-settings>
              <app-header-right-sim-list>
                <ul class="nav navbar-nav sr-navbar-right">
                  <li><a href data-ng-click="nav.showImportModal()"><span class="glyphicon glyphicon-cloud-upload"></span> Import</a></li>
                </ul>
              </app-header-right-sim-list>
            </div>
        `,
        controller: function($scope) {
            $scope.cebafService = cebafService;
        },
    };
});


SIREPO.app.directive('latticeFooter', function(appState, latticeService, panelState, utilities, $timeout) {
    return {
        restrict: 'A',
        scope: {
            width: '@',
        },
        template: `
            <div>
                <button class="btn btn-default">Clear Faults</button>
            </div>
        `,
        controller: function($scope) {
        },
    };
});


SIREPO.app.directive('mlModelConfig', function(appState, cebafService, panelState, plot2dService, plotting, requestSender, utilities) {
    return {
        restrict: 'A',
        scope: {
            field: '=',
            model: '=',
            modelName: '=',
        },
        template: `
            <div>
                <table class="table">
                    <thead>
                      <tr>
                        <th data-ng-repeat="h in header">{{ h.name }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr data-ng-repeat="r in model.configItems track by $index">
                        <td data-ng-repeat="k in headerKeys" class="form-group form-group-sm">
                          <p class="form-control-static">
                            <span data-ng-if="r[k].displayType === 'label'">{{ r[k].value }}</span>
                            <span data-ng-if="r[k].displayType === 'input'" class="col-sm-5"><input data-string-to-number="" data-ng-model="r[k].value" data-min="0" class="form-control" style="text-align: right" data-lpignore="true"/></span>
                          </p>
                        </td>
                      </tr>
                    </tbody>
                </table>
            </div>
        `,
        controller: function($scope) {
            $scope.header = SIREPO.APP_SCHEMA.constants.configColumns;
            $scope.headerKeys = $scope.header.map(x => x.field);

            const modelName = $scope.modelName;

            function loadConfig() {
                if (! $scope.model.file) {
                    updateConfig([]);
                    return;
                }
                if ($scope.model.configItems.length > 0) {
                    return;
                }
                $scope.model.configItems = [];
                requestSender.sendStatelessCompute(
                    appState,
                    data => {
                        updateConfig(data.config);
                    },
                    {
                        method: 'load_thresholds',
                        file: $scope.model.file,
                    }
                );
            }

            function rowToItem(row) {
                let item = {};
                for (let i = 0; i < row.length; ++i) {
                    const h = $scope.header[i];
                    item[h.field] = {
                        value: row[i],
                        displayType: h.type
                    };
                }
                if (item.io.value === 'input') {
                    item.tolerance.value = 'N/A';
                    item.tolerance.displayType = 'label';
                }
                return item;
            }

            function updateConfig(config) {
                appState.models[modelName].configItems = config.map(rowToItem);
                appState.saveQuietly(modelName);
            }

            $scope.$on(`${modelName}.changed`, () => {
                $scope.model.configItems = [];
                loadConfig();
            });

            loadConfig();
        },
    };
});


SIREPO.viewLogic('beamlineView', function(appState, panelState, $scope) {

    function updateBeamline() {
    }

    $scope.whenSelected = updateBeamline;
    $scope.watchFields = [];
});


SIREPO.viewLogic('simulationStatusView', function(appState, panelState, $scope) {

    $scope.watchFields = [
        ["mlModelConfig.mlModel",], () => {
        }
    ];

});


