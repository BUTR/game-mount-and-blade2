import { types } from 'vortex-api';

export class ModOptionsManager {
  private static instance: ModOptionsManager;

  public static getInstance(api: types.IExtensionApi): ModOptionsManager {
    if (!ModOptionsManager.instance) {
      if (api === undefined) {
        throw new Error('IniStructure is not context aware');
      }
      ModOptionsManager.instance = new ModOptionsManager(api);
    }

    return ModOptionsManager.instance;
  }

  private api: types.IExtensionApi;

  constructor(api: types.IExtensionApi) {
    this.api = api;
  }

  public reloadOptions(): void {}
}
