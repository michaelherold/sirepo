import { 
    Col,
    Row,
    Container,
    Nav,
    Navbar
} from "react-bootstrap";
import {
    useState,
    useEffect,
    useContext
} from "react";
import {
    ContextAppName,
    ContextSimulationListPromise,
    ContextRelativeRouterHelper,
    ContextLayouts,
    ContextSchema,
    ContextModelsWrapper,
    ContextSimulationInfoPromise
} from "../context";
import {
    updateModel,
    selectModel,
    selectModels
} from "../store/models";
import { ModelsWrapper } from "../data/model";
import { FormStateInitializer } from "../component/form";
import { useResolvedPath } from "react-router-dom";
import { RouteHelper } from "../hook/route";

function SimulationInfoInitializer (props) {
    let simulationListPromise = useContext(ContextSimulationListPromise);
    
    let [simulationInfoPromise, updateSimulationInfoPromise] = useState(undefined);
    let [hasInit, updateHasInit] = useState(false);
    let appName = useContext(ContextAppName);

    let modelsWrapper = new ModelsWrapper({
        modelActions: {
            updateModel
        },
        modelSelectors: {
            selectModel,
            selectModels
        }
    })

    useEffect(() => {
        updateSimulationInfoPromise(new Promise((resolve, reject) => {
            simulationListPromise.then(simulationList => {
                // TODO: this is definitely wrong
                let simulation = simulationList[0];
                let { simulationId } = simulation;
                // TODO: why 0
                fetch(`/simulation/${appName}/${simulationId}/0/source`).then(async (resp) => {
                    let simulationInfo = await resp.json();
                    let { models } = simulationInfo;

                    console.log("models", models);

                    for(let [modelName, model] of Object.entries(models)) {
                        modelsWrapper.updateModel(modelName, model);
                    }

                    resolve({...simulationInfo, simulationId});
                    updateHasInit(true);
                })
            })
        }))
    }, [])

    return hasInit && simulationInfoPromise && (
        <ContextModelsWrapper.Provider value={modelsWrapper}>
            <ContextSimulationInfoPromise.Provider value={simulationInfoPromise}>
                {props.children}
            </ContextSimulationInfoPromise.Provider>
        </ContextModelsWrapper.Provider>
    )
}

export const NavbarContainerId = "nav-tabs-container";

export function SimulationOuter(props) {
    let appName = useContext(ContextAppName);

    let simBrowerRelativeRouter = useContext(ContextRelativeRouterHelper);

    let pathPrefix = useResolvedPath('');
    let currentRelativeRouter = new RouteHelper(pathPrefix);

    let titleCaseAppName = appName.split(" ").map(word => {
        return word.substring(0,1).toUpperCase() + (word.length > 1 ? word.substring(1) : "");
    }).join(" ");

    // TODO: navbar should route to home, when one is made
    return (
        <Container>
            <Navbar>
                <Container id={NavbarContainerId}>
                    <Navbar.Brand href={simBrowerRelativeRouter.getCurrentPath()}>
                        <img
                        alt=""
                        src="/react/img/sirepo.gif"
                        width="30"
                        height="30"
                        className="d-inline-block align-top"
                        />{' '}
                        {titleCaseAppName}
                    </Navbar.Brand>
                </Container>
            </Navbar>
            <ContextRelativeRouterHelper.Provider value={currentRelativeRouter}>
                {props.children}
            </ContextRelativeRouterHelper.Provider>
        </Container>
        
    )

}

export function SimulationRoot(props) {
    let layouts = useContext(ContextLayouts);

    let schema = useContext(ContextSchema);

    let viewComponents = schema.views.map((view, index) => {
        let layout = layouts.getLayoutForConfig(view);
        let Component = layout.component;
        return (
            <Col md={6} className="mb-3" key={index}>
                <Component config={view}></Component>
            </Col>
        )
    });

    // TODO: use multiple rows
    return (
        <SimulationOuter>
            <SimulationInfoInitializer>
                <FormStateInitializer>
                    <Container fluid className="mt-3">
                        <Row>
                            {viewComponents}
                        </Row>
                    </Container>
                </FormStateInitializer>
            </SimulationInfoInitializer>
        </SimulationOuter>
    )
}
