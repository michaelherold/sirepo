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
        <div data-ng-switch-when="ThresholdList" class="col-sm-7">
           <div data-bpm-thresholds=""  data-model="model"></div>
        </div>
        <div data-ng-switch-when="ThresholdsFile" class="col-sm-7">
           <div data-file-field="field" data-file-type="csv" data-model="model" data-selection-required="false" data-empty-selection-text="None"></div>
        </div>
    `;
    SIREPO.lattice = {
        elementColor: {
            OCTUPOLE: 'yellow',
            QUADRUPOLE: 'red',
            SEXTUPOLE: 'lightgreen',
            KICKER: 'black',
            HKICKER: 'black',
            VKICKER: 'black',
        },
        elementPic: {
            aperture: ['COLLIMATOR', 'ECOLLIMATOR', 'RCOLLIMATOR'],
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

    self.hasMadxLattice = () => appState.applicationState().externalLattice;

    self.monitors = () => {
        const l = self.latticeModels();
        if (! l) {
            return;
        }
        return l.beamlines[0].items
            .map(i => self.elementForId(i))
            .filter(e => ['HMONITOR', 'MONITOR', 'VMONITOR'].includes(e.type));
    };

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
    self.appState = appState;
    self.simScope = $scope;

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

    function modelDataForElement(element) {
        return {
            modelKey: 'el_' + element._id,
            title: element.name.replace(/_/g, ' '),
            viewName: element.type,
            getData: () => element,
        };
    }

    function windowResize() {
        self.colClearFix = $window.matchMedia('(min-width: 1600px)').matches
            ? 6 : 4;
    }

    self.cebafService = cebafService;

    self.cancelCallback = () => $scope.$broadcast('sr-latticeUpdateComplete');


    //TODO(pjm): init from template to allow listeners to register before data is received
    self.init = () => {
    };

    self.startSimulation = () => {
        $scope.$broadcast('sr-clearElementValues');
        appState.saveChanges('optimizerSettings', self.simState.runSimulation);
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
                  <li class="sim-section" data-ng-if="cebafService.hasMadxLattice()" data-ng-class="{active: nav.isActive(\'config\')}"><a href data-ng-click="nav.openSection(\'config\')"><span class="glyphicon glyphicon-wrench"></span> Config</a></li>
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

SIREPO.app.directive('bpmMonitorPlot', function(appState, cebafService, panelState, plot2dService, plotting, utilities) {
    return {
        restrict: 'A',
        scope: {
            bpmMonitorPlot: '@',
            modelName: '@',
            zoom: '@'
        },
        templateUrl: '/static/html/plot2d.html' + SIREPO.SOURCE_CACHE_KEY,
        controller: function($scope) {
            const id = parseInt($scope.modelName.match(/[0-9]+/)[0]);
            $scope.model = cebafService.elementForId(id);
            let thresholds = [{}];
            const thresholdId = `sr-threshold-rect-${id}`;
            const defaultDomain = [-0.0021, 0.0021];
            let points;
            let colName = $scope.modelName.substring(0, $scope.modelName.indexOf('Report'));
            $scope.isClientOnly = true;
            $scope[`isZoom${$scope.zoom}`] = true;

            function clearPoints() {
                points = [];
                plotting.addConvergencePoints($scope.select, '.plot-viewport', [], points);
                $scope.select('.plot-viewport').selectAll('.sr-scatter-point').remove();
                ['x', 'y'].forEach(dim => {
                    $scope.axes[dim].domain = [-1, 1];
                    $scope.axes[dim].scale.domain(appState.clone(defaultDomain));
                });
            }

            function domainWidth(domain) {
                return domain[1] - domain[0];
            }

            function fitPoints() {
                if (points.length <= 1) {
                    return;
                }
                let dim = appState.clone(defaultDomain);
                if (domainWidth($scope.axes.x.scale.domain()) < domainWidth(defaultDomain)) {
                    // keep current domain if domain width is smaller than default domain
                    // the user has zoomed in
                    return;
                }
                [0, 1].forEach(i => {
                    points.forEach(p => {
                        if (p[i] < dim[0]) {
                            dim[0] = p[i];
                        }
                        if (p[i] > dim[1]) {
                            dim[1] = p[i];
                        }
                    });
                    let pad = (dim[1] - dim[0]) / 20;
                    if (pad == 0) {
                        pad = 0.1;
                    }
                    dim[0] -= pad;
                    dim[1] += pad;
                });
                if ( -dim[0] > dim[1]) {
                    dim[1] = -dim[0];
                }
                else if (-dim[0] < dim[1]) {
                    dim[0] = -dim[1];
                }
                ['x', 'y'].forEach(axis => {
                    $scope.axes[axis].scale.domain(dim).nice();
                });
            }

            function pushAndTrim(p) {
                const MAX_BPM_POINTS = SIREPO.APP_SCHEMA.constants.maxBPMPoints;
                if (points.length && appState.deepEquals(p, points[points.length - 1])) {
                    return;
                }
                points.push(p);
                if (points.length > MAX_BPM_POINTS) {
                    points = points.slice(points.length - MAX_BPM_POINTS);
                }
            }

            $scope.init = () => {
                plot2dService.init2dPlot($scope, {
                    margin: {top: 50, right: 10, bottom: 50, left: 75},
                });
                $scope.load();
            };

            $scope.load = () => {
                clearPoints();
                $scope.aspectRatio = 1;
                $scope.updatePlot({
                    x_label: 'x [m]',
                    y_label: 'y [m]',
                    title: $scope.bpmMonitorPlot + ' Monitor',
                });
            };

            $scope.refresh = () => {
                plotting.refreshConvergencePoints($scope.select, '.plot-viewport', $scope.graphLine);
                $scope.select('.plot-viewport').selectAll('.sr-scatter-point')
                    .data(points)
                    .enter().append('circle')
                    .attr('class', 'sr-scatter-point')
                    .attr('r', 8);
                $scope.select('.plot-viewport').selectAll('.sr-scatter-point')
                    .attr('cx', $scope.graphLine.x())
                    .attr('cy', $scope.graphLine.y())
                    .attr('style', (d, i) => {
                        if (i == points.length - 1) {
                            return `fill: rgba(0, 0, 255, 0.7); stroke-width: 4; stroke: black`;
                        }
                        let opacity = (i + 1) / points.length * 0.5;
                        return `fill: rgba(0, 0, 255, ${opacity}); stroke-width: 1; stroke: black`;
                    });
            };

            $scope.$on('sr-elementValues', (event, rows) => {
                if (rows.length > 1) {
                    clearPoints();
                }
                rows.forEach(values => {
                    const point = [
                        parseFloat(values[colName + '.x'] || 0),
                        parseFloat(values[colName + '.y'] || 0),
                    ];
                    pushAndTrim(point);
                });
                fitPoints();
                plotting.addConvergencePoints($scope.select, '.plot-viewport', [], points);
                $scope.resize();
            });

            $scope.$on('sr-clearElementValues', () => {
                clearPoints();
                $scope.refresh();
            });
        },
        link: (scope, element) => plotting.linkPlot(scope, element),
    };
});


SIREPO.app.directive('bpmThresholds', function(appState, cebafService, panelState, plot2dService, plotting, utilities) {
    return {
        restrict: 'A',
        scope: {
        },
        template: `
            <div>
                <table class="table">
                    <thead>
                      <tr>
                        <th>Element</th>
                        <th>Field</th>
                        <th class="text-center">Model Directions</th>
                        <th class="text-center">Model Tolerance (pct)</th>
                        <th class="text-center">Channel Id</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr data-ng-repeat="element in elements track by $index">
                        <td class="form-group form-group-sm"><p class="form-control-static">{{ element.name }}</p></td>
                        <td class="form-group form-group-sm"><p class="form-control-static">{{ element.field }}</p></td>
                        <td class="form-group form-group-sm"><p class="form-control-static">{{ element.modelDirection }}</p></td>
                        <td class="form-group form-group-sm"><p class="form-control-static"><input value="{{ element.tolerance }}"></p></td>
                        <td class="form-group form-group-sm"><p class="form-control-static">{{ element.channelId }}</p></td>
                      </tr>
                    </tbody>
                </table>
            </div>
        `,
        controller: function($scope) {

            // placeholder
            $scope.elements = [
                {
                    channelId: 0,
                    field: 'hcurrent',
                    name: 'CORR1',
                    modelDirection: 'Input',
                    tolerance: 0.01,
                },
                {
                    channelId: 0,
                    field: 'vcurrent',
                    name: 'CORR1',
                    modelDirection: 'Input',
                    tolerance: 0.01,
                },
                {
                    channelId: 1,
                    name: 'CORRX1',
                    field: 'current',
                    modelDirection: 'Input',
                    tolerance: 0.01,
                },
                {
                    channelId: 2,
                    name: 'CORRY1',
                    field: 'current',
                    modelDirection: 'Input',
                    tolerance: 0.01,
                },
                {
                    channelId: 3,
                    name: 'CORRX2',
                    field: 'current',
                    modelDirection: 'Input',
                    tolerance: 0.01,
                },
                {
                    channelId: 4,
                    name: 'CORRY2',
                    field: 'current',
                    modelDirection: 'Input',
                    tolerance: 0.01,
                },
                {
                    channelId: 5,
                    name: 'CORR2',
                    field: 'hcurrent',
                    modelDirection: 'Input',
                    tolerance: 0.01,
                },
                {
                    channelId: 5,
                    name: 'CORR2',
                    field: 'vcurrent',
                    modelDirection: 'Input',
                    tolerance: 0.01,
                }
            ];

            function readoutItems() {
                let elements = {};
                const models = controlsService.latticeModels();
                models.beamlines[0].items.forEach(elId => {
                    let el = latticeService.elementForId(elId, models);
                    let rg = readoutGroup(el);
                    if (! rg) {
                        return;
                    }
                    if (! elements[rg]) {
                        elements[rg] = [];
                    }
                    // elements are in beamline order
                    elements[rg].push({
                        element: el,
                    });
                });
                return elements;
            }

        },
    };
});


SIREPO.viewLogic('beamlineView', function(appState, panelState, $scope) {

    function updateBeamline() {
    }

    $scope.whenSelected = updateBeamline;
    $scope.watchFields = [];
});

SIREPO.viewLogic('commandBeamView', function(appState, panelState, $scope) {

    function updateParticleFields() {
        panelState.showFields('command_beam', [
            ['mass', 'charge'], appState.models.command_beam.particle == 'other',
        ]);
    }

    $scope.whenSelected = updateParticleFields;
    $scope.watchFields = [
        ['command_beam.particle'], updateParticleFields,
    ];
});

['kickerView', 'hkickerView', 'vkickerView'].forEach(view => {
    SIREPO.viewLogic(
        view,
        function(cebafService, panelState, $scope) {
            $scope.whenSelected = () => {
                const r = cebafService.noOptimizationRunning();
                panelState.enableFields('KICKER', [
                    ['current_hkick', 'current_vkick'], r,
                ]);
                ['HKICKER', 'VKICKER'].forEach((m) => {
                    panelState.enableField(m, 'current_kick', r);
                });
            };
        }
    );
});

SIREPO.viewLogic('quadrupoleView', function(appState, cebafService, panelState, $scope) {
    $scope.whenSelected = () => {
        panelState.enableField(
            'QUADRUPOLE',
            'current_k1',
            cebafService.noOptimizationRunning()
        );
    };
});




