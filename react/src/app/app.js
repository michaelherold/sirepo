// import {React}
import React, { useContext, useEffect, useState } from "react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { useSetup } from "../hooks";
import {
    modelsSlice
} from "../models";
import {
    formStatesSlice
} from '../formState'
import "./app.scss"
import { compileSchemaFromJson } from '../schema'
import { ViewLayoutsPanel } from "../components/panel";
import { 
    ContextAppInfo,
    ContextAppName,
    ContextAppViewBuilder,
    ContextReduxFormActions, 
    ContextReduxFormSelectors, 
    ContextSimulationListPromise 
} from '../components/context'
import { SimulationBrowserRoot } from "./simbrowser";

function SimulationListInitializer(child) {
    return (props) => {
        let stateFn = useState;
        let effectFn = useEffect;
        let contextFn = useContext;

        let [simulationListPromise, updateSimulationListPromise] = stateFn(undefined)
        let appName = contextFn(ContextAppName);

        effectFn(() => {
            updateSimulationListPromise(new Promise((resolve, reject) => {
                fetch('/simulation-list', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        simulationType: appName
                    })
                }).then(async (resp) => {
                    let simulationList = await resp.json();
                    resolve(simulationList);
                })
            }))
        }, [])

        let ChildComponent = child;
        return simulationListPromise && (
            <ContextSimulationListPromise.Provider value={simulationListPromise}>
                <ChildComponent {...props}>

                </ChildComponent>
            </ContextSimulationListPromise.Provider>
        )
    }
}

const MissingComponentPlaceholder = (props) => {
    return (
        <div>
            Missing Component Builder!
        </div>
    )
}

function AppViewBuilderWrapper(child) {
    let ChildComponent = child;
    return (props) => {
        let contextFn = useContext;
        let appInfo = contextFn(ContextAppInfo);
        let viewBuilder = new AppViewBuilder(appInfo);
        return (
            <ContextAppViewBuilder.Provider value={viewBuilder}>
                <ChildComponent {...props}/>
            </ContextAppViewBuilder.Provider>
        )
    }  
}

function AppInfoWrapper(appInfo) {
    return (child) => {
        let ChildComponent = child;
        return (props) => {
            return (
                <ContextAppInfo.Provider value={appInfo}>
                    <ChildComponent {...props}/>
                </ContextAppInfo.Provider>
            )
        }
    }
}

class AppViewBuilder{
    constructor (appInfo) { 
        this.components = {
            'panel': ViewLayoutsPanel(appInfo)
        }
    }

    buildComponentForView = (view) => {
        let componentBuilder = this.components[view.type || 'panel'];

        if(!componentBuilder) {
            console.error("missing view builder for view: " + view.name + ": " + view.type)
            return MissingComponentPlaceholder;
        }

        return componentBuilder(view);
    }
}

let ReduxConstantsWrapper = (child) => {
    return (props) => {
        let ChildComponent = child;

        return (
            <ChildComponent {...props}></ChildComponent>
        )
    }
}

function buildAppComponentsRoot(schema) {
    let appInfo = {schema};

    return ReduxConstantsWrapper(
        AppInfoWrapper(appInfo)(
            AppViewBuilderWrapper(
                SimulationListInitializer(
                    () => {
                        return (
                            <SimulationBrowserRoot/>
                        )
                    }
                )
            )
        )
    )
}


const AppRoot = (props) => {
    const [schema, updateSchema] = useState(undefined);
    const formStateStore = configureStore({
        reducer: {
            [modelsSlice.name]: modelsSlice.reducer,
            [formStatesSlice.name]: formStatesSlice.reducer,
        },
    });

    let appName = useContext(ContextAppName);

    const hasSchema = useSetup(true,
        (finishInitSchema) => {
            fetch(`/react/schema/${appName}.json`).then(resp => {
                resp.json().then(json => {
                    updateSchema(compileSchemaFromJson(json));
                    finishInitSchema();
                })
            })
        }
    )

    const hasMadeHomepageRequest = useSetup(true,
        (finishHomepageRequest) => {
            fetch(`/auth-guest-login/${appName}`).then(() => {
                finishHomepageRequest();
            });
        }
    )

    if(hasSchema && hasMadeHomepageRequest) {
        let AppChild = buildAppComponentsRoot(schema);
        return (
            <Provider store={formStateStore}>
                <AppChild></AppChild>
            </Provider>
        )
    }
}

//function AppHeader

export default AppRoot;
