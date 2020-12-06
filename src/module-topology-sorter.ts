/*
import Promise from 'bluebird';
import { ModuleInfo, LoadOrder }  from "./types";

export function TopologySort(modules: ModuleInfo[]): ModuleInfo[] {
    const list: ModuleInfo[] = [];
    const visited: Map<ModuleInfo, boolean> = new Map<ModuleInfo, boolean>();
    modules.forEach(module => {
        Visit(module, moduleLambda => GetDependentModulesOf(modules, moduleLambda), list, visited);
    });
    return list;
}

function Visit(module: ModuleInfo, getDependencies: (module: ModuleInfo) => ModuleInfo[], sorted: ModuleInfo[], visited: Map<ModuleInfo, boolean>): void {
    if (visited.has(module)) {
        return;
    }

    visited.set(module, true);

    const dependencies = getDependencies(module);
    dependencies.forEach(dependency => {
        Visit(dependency, getDependencies, sorted, visited);
    });

    visited.set(module, false);

    sorted.push(module);
}

function GetDependentModulesOf(source: ModuleInfo[], module: ModuleInfo): ModuleInfo[] {
    const dependencies: ModuleInfo[] = [];

    module.DependedModules.forEach(dependedModule => {
        const dependency = source.find(moduleLambda => moduleLambda.Id == dependedModule.Id);
        if (dependency != null) {
            dependencies.push(dependency);
        }
    });

    module.DependedModuleMetadatas.forEach(dependedModuleMetadata => {
        const dependency = source.find(moduleLambda => moduleLambda.Id == dependedModuleMetadata.Id && dependedModuleMetadata.Order == LoadOrder.LoadBeforeThis);
        if (dependency != null) {
            dependencies.push(dependency);
        }
    });

    source.forEach(moduleInfo => {
        moduleInfo.DependedModuleMetadatas.forEach(dependedModuleMetadata => {
            if (dependedModuleMetadata.Id === module.Id && dependedModuleMetadata.Order == LoadOrder.LoadAfterThis) {
                dependencies.push(moduleInfo);
            }
        });
    });

    return dependencies;
}
*/