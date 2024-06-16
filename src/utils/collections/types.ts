import { types } from 'vortex-api';
import { ICollection as ICollectionDataToExport } from 'collections/src/types/ICollection';
import { IExtensionFeature } from 'collections/src/util/extension';
import { IStatePersistent, PersistenceLoadOrderStorage } from '../../types';
import { PersistentModOptionsEntry } from '../modoptions';

export interface ICollectionData extends ICollectionDataToExport {}

export type IncludedModOptions = {
  includedModOptions?: PersistentModOptionsEntry[];
};

export type ModAttributesWithCollection<T = unknown> = types.IMod['attributes'] & {
  collection?: T;
};

export interface IModWithCollection<T = unknown> extends types.IMod {
  attributes?: ModAttributesWithCollection<T>;
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
  loadOrder: types.LoadOrder; // TODO: check what the data is
}
export interface ICollectionDataWithLegacyData extends ICollectionData, ICollectionLegacyData {}

export interface ICollectionSettingsData {
  includedModOptions: PersistentModOptionsEntry[];
}
export interface ICollectionDataWithSettingsData extends ICollectionData, ICollectionSettingsData {}
