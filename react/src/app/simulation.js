import { useContext, useState, useEffect } from "react";
import { ContextSimulationListPromise, 
        ContextReduxModelActions, 
        ContextSimulationInfoPromise, 
        ContextAppName, 
        ContextAppInfo, 
        ContextAppViewBuilder} from "../components/context";
import { useDispatch } from "react-redux";
import { mapProperties } from "../helper";
import { FormStateInitializer } from "../components/form";
import { Row, Col, Container } from "react-bootstrap";

export function ViewGrid(props) {
    let { views, ...otherProps } = props;
    let viewPanels = Object.entries(views).map(([id, view]) => {
        let View = view;
        return (
            <Col md={6} className="mb-3" key={id}>
                <View {...otherProps}/>
            </Col>
        )
    });
    return (
        <Container fluid className="mt-3">
            <Row>
                {viewPanels}
            </Row>
        </Container>
    )
}

function SimulationInfoInitializer(child) {
    return (props) => {
        let contextFn = useContext;
        let stateFn = useState;
        let effectFn = useEffect;
        let dispatchFn = useDispatch;

        let simulationListPromise = contextFn(ContextSimulationListPromise);
        let { updateModel } = contextFn(ContextReduxModelActions);
        let [simulationInfoPromise, updateSimulationInfoPromise] = stateFn(undefined);
        let [hasInit, updateHasInit] = stateFn(false);
        let appName = contextFn(ContextAppName);
        let dispatch = dispatchFn();

        effectFn(() => {
            updateSimulationInfoPromise(new Promise((resolve, reject) => {
                simulationListPromise.then(simulationList => {
                    let simulation = simulationList[0];
                    let { simulationId } = simulation;
                    // TODO: why 0
                    fetch(`/simulation/${appName}/${simulationId}/0/source`).then(async (resp) => {
                        let simulationInfo = await resp.json();
                        let { models } = simulationInfo;
                        console.log("retrieved simulation info", simulationInfo);
                        // TODO: use models

                        for(let [modelName, model] of Object.entries(models)) {
                            dispatch(updateModel({
                                name: modelName,
                                value: model
                            }));
                        }

                        resolve({...simulationInfo, simulationId});
                        updateHasInit(true);
                    })
                })
            }))
        }, [])

        let ChildComponent = child;
        return hasInit && simulationInfoPromise && (
            <ContextSimulationInfoPromise.Provider value={simulationInfoPromise}>
                <ChildComponent {...props}>

                </ChildComponent>
            </ContextSimulationInfoPromise.Provider>
        )
    }
}

export function SimulationRoot(props) {
    let { simulation } = props;

    let appInfo = useContext(ContextAppInfo);
    let viewBuilder = useContext(ContextAppViewBuilder);
    let { schema } = appInfo;

    let viewInfos = mapProperties(schema.views, (viewName, view) => {
        return {
            view,
            viewName: viewName
        }
    })
    let viewComponents = mapProperties(viewInfos, (viewName, viewInfo) => viewBuilder.buildComponentForView(viewInfo));

    let buildSimulationRoot = (simulation) => {
        return SimulationInfoInitializer(
            FormStateInitializer({ viewInfos, schema })(
                () => {
                    return <ViewGrid views={Object.values(viewComponents)}/>
                }
            )
        );
    }

    let SimulationChild = buildSimulationRoot(simulation);

    return <SimulationChild></SimulationChild>
}
