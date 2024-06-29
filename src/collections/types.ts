import { types } from 'vortex-api';
import { ICollection as ICollectionDataToExport } from 'collections/src/types/ICollection';
import { IExtensionFeature } from 'collections/src/util/extension';
import { IModAttributes, IStatePersistent, PersistenceLoadOrderStorage } from '../types';
import { PersistentModOptionsEntry } from '../modoptions';

export interface ICollectionData extends ICollectionDataToExport {}

export type IncludedModOptions = {
  includedModOptions?: PersistentModOptionsEntry[];
};

export type IModAttributesWithCollection<T = unknown> = IModAttributes & {
  collection?: T;
};

export interface IModWithCollection<T = unknown> extends types.IMod {
  attributes?: IModAttributesWithCollection<T>;
}

export interface IModWithIncludedModOptions extends IModWithCollection<IncludedModOptions> {}

export interface IStatePersistentWithModsWithIncludedModOptions extends IStatePersistent {
  mods: {
    [gameId: string]: {
      [modId: string]: IModWithCollection<IncludedModOptions>;
    };
  };
}

export interface ICollectionFeature {
  registerCollectionFeature: (
    id: IExtensionFeature['id'],

    generate: IExtensionFeature['generate'],
    parse: IExtensionFeature['parse'],
    clone: IExtensionFeature['clone'],

    title: IExtensionFeature['title'],
    condition?: IExtensionFeature['condition'],
    editComponent?: IExtensionFeature['editComponent']
  ) => void;
}

export interface IExtensionContextWithCollectionFeature extends types.IExtensionContext {
  optional: ICollectionFeature;
}

export interface ICollectionGeneralData {
  hasBLSE: boolean;
  suggestedLoadOrder: PersistenceLoadOrderStorage;
}
export interface ICollectionDataWithGeneralData extends ICollectionData, ICollectionGeneralData {}

export interface ICollectionLegacyData {
  loadOrder: types.ILoadOrderEntry<never>[];
}
export interface ICollectionDataWithLegacyData extends ICollectionData, ICollectionLegacyData {}

export interface ICollectionSettingsData {
  includedModOptions: PersistentModOptionsEntry[];
}
export interface ICollectionDataWithSettingsData extends ICollectionData, ICollectionSettingsData {}
