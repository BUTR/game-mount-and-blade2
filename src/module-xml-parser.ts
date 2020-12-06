import Promise from 'bluebird';
import { fs } from "vortex-api";
import * as xmlParser from "fast-xml-parser";
import { ModuleInfo, DependedModule, DependedModuleMetadata, LoadOrder, SubModuleInfo }  from "./types";
//let { fs } = require('vortex-api');
//if (fs == null) {  fs = require('fs'); } // for internal testing

export function ParseModule(path: string): ModuleInfo {
    interface XmlModuleRoot {
        readonly Module: XmlModule;
    }
    interface XmlModule {
        readonly Name: { readonly value: string; };
        readonly Id: { readonly value: string; };
        readonly Version: { readonly value: string; };
        readonly Official: { readonly value: boolean; };
        readonly SingleplayerModule?: { readonly value: boolean; };
        readonly MultiplayerModule?: { readonly value: boolean; };
        readonly Url?: { readonly value: string; };
        readonly DependedModules?: { readonly DependedModule?: string[]; };
        readonly DependedModuleMetadatas?: { readonly DependedModuleMetadata?: XmlDependedModuleMetadata[]; };
        readonly SubModules?: { readonly SubModule?: XmlSubModule[]; };
    }
    interface XmlDependedModuleMetadata {
        readonly id: string;
        readonly order: LoadOrder;
        readonly optional?: boolean;
    }
    interface XmlSubModule {
        readonly Name: { readonly value: string; };
        readonly DLLName: { readonly value: string; };
        readonly SubModuleClassType: { readonly value: string; };
        readonly Assemblies?: {
            readonly Assembly?: { readonly value: string; }[];
        };
        readonly Tags?: { 
            readonly Tag?: XmlTag[];
        };
    }
    interface XmlTag {
        readonly key: string;
        readonly value: string;
    }

    const xmlFile = fs.readFileSync(path);
    const options = {
        attributeNamePrefix : '',
        ignoreAttributes : false,
        ignoreNameSpace : true,
        allowBooleanAttributes : true,
        parseNodeValue : false,
        parseAttributeValue : true,
        arrayMode: false,
    };
    const jsonObj: XmlModuleRoot = xmlParser.parse(xmlFile.toString(), options);

    const dependedModules: DependedModule[] = [];
    if (jsonObj.Module.DependedModules != null && jsonObj.Module.DependedModules.DependedModule != null) {
        jsonObj.Module.DependedModules.DependedModule.forEach((element: string) => {
            dependedModules.push( { Id: element });
        });
    }

    const dependedModuleMetadatas: DependedModuleMetadata[] = [];
    if (jsonObj.Module.DependedModuleMetadatas != null && jsonObj.Module.DependedModuleMetadatas.DependedModuleMetadata != null) {
        jsonObj.Module.DependedModuleMetadatas.DependedModuleMetadata.forEach((element: XmlDependedModuleMetadata) => {
            dependedModuleMetadatas.push( { Id: element.id, Order: element.order, Optional: element.optional });
        });
    }

    const subModules: SubModuleInfo[] = [];
    if (jsonObj.Module.SubModules != null && jsonObj.Module.SubModules.SubModule != null) {
        jsonObj.Module.SubModules.SubModule.forEach((subModule: XmlSubModule) => {
            const assemblies: string[] = [];
            if (subModule.Assemblies != null && subModule.Assemblies.Assembly != null) {
                subModule.Assemblies.Assembly.forEach((assembly: { value: string}) => {
                    assemblies.push(assembly.value);
                });
            }

            const tags: Map<string, string> = new Map<string, string>();
            if (subModule.Tags != null && subModule.Tags.Tag != null) {
                subModule.Tags.Tag.forEach((tag: XmlTag) => {
                    tags.set(tag.key, tag.value);
                });
            }

            subModules.push({
                Name: subModule.Name != null ? subModule.Name.value : '',
                DLLName: subModule.DLLName != null ? subModule.DLLName.value : '',
                SubModuleClassType: subModule.SubModuleClassType != null ? subModule.SubModuleClassType.value : '',
                Assemblies: assemblies,
                Tags: tags
            });
        });
    }

    return {
        Name: jsonObj.Module.Name != null ? jsonObj.Module.Name.value : '',
        Id: jsonObj.Module.Id != null ? jsonObj.Module.Id.value : '',
        Version: jsonObj.Module.Version != null ? jsonObj.Module.Version.value : '',
        Official: jsonObj.Module.Official != null ? jsonObj.Module.Official.value : false,
        SingleplayerModule: jsonObj.Module.SingleplayerModule != null ? jsonObj.Module.SingleplayerModule.value : false,
        MultiplayerModule: jsonObj.Module.MultiplayerModule != null ? jsonObj.Module.MultiplayerModule.value : false,
        Url: jsonObj.Module.Url != null ? jsonObj.Module.Url.value : '',
        DependedModules: dependedModules,
        DependedModuleMetadatas: dependedModuleMetadatas,
        SubModules: subModules
    }
}