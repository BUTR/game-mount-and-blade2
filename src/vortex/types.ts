import { types } from 'vortex-api';
import { GAME_ID } from '../common';
import { IBannerlordModStorage, IStatePersistent, VortexLoadOrderStorage } from '../types';

export interface IStatePersistentWithLoadOrder extends IStatePersistent {
  loadOrder: {
    [profileId: string]: VortexLoadOrderStorage;
  };
}

export interface IModTableWithBannerlord extends types.IModTable {
  [GAME_ID]: IBannerlordModStorage;
}

export interface IStatePersistentWithBannerlordMods extends IStatePersistent {
  mods: IModTableWithBannerlord;
}

export interface ISettingsInterfaceWithPrimaryTool extends types.ISettingsInterface {
  primaryTool: {
    [GAME_ID]?: string;
  };
}
