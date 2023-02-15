import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { types, util } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { GAME_ID } from '../common';
import { VortexViewModel, VortexViewModelStorage, ModsStorage } from '../types';
import { VortexLauncherManager } from './VortexLauncherManager';

const isNonVortex = (context: types.IExtensionContext, subModId: string): boolean => {
  const state = context.api.getState();
  const mods = util.getSafe<ModsStorage>(state, [`persistent`, `mods`, GAME_ID], {});
  const modIds = Object.keys(mods);
  for (const modId of modIds) {
    const subModIds = util.getSafe<Array<string>>(mods[modId], [`attributes`, `subModsIds`], []);
    if (subModIds.includes(subModId)) {
      return false;
    }
  }
  return true;
};

const getLoadOrderFromDisplayItems = (items: VortexViewModelStorage): vetypes.LoadOrder => items.reduce<vetypes.LoadOrder>((map, item) => {
  map[item.id] = {
    id: item.moduleInfo.id,
    name: item.moduleInfo.name,
    isSelected: item.isSelected,
    index: item.index,
  };
  return map;
}, { });

const getCurrentLoadOrder = (manager: VortexLauncherManager): vetypes.LoadOrder => Object.values(manager.moduleViewModels).reduce<vetypes.LoadOrder>((map, item) => {
  map[item.moduleInfoExtended.id] = {
    id: item.moduleInfoExtended.id,
    name: item.moduleInfoExtended.name,
    isSelected: item.isSelected,
    index: item.index,
  }
  return map;
}, { });

const createDisplayItem = (context: types.IExtensionContext, viewModel: vetypes.ModuleViewModel, index: number): VortexViewModel => ({
  id: viewModel.moduleInfoExtended.id,
  name: viewModel.moduleInfoExtended.name,
  imgUrl: `${__dirname}/gameart.jpg`,
  external: isNonVortex(context, viewModel.moduleInfoExtended.id),
  official: viewModel.moduleInfoExtended.isOfficial,
  moduleInfo: viewModel.moduleInfoExtended,
  index: index,
  isSelected: viewModel.isSelected,
  isDisabled: viewModel.isDisabled,
  isValid: viewModel.isValid,
});

const fromLoadOrder = (context: types.IExtensionContext, manager: VortexLauncherManager, loadOrder: vetypes.LoadOrder, placeholder?: VortexViewModelStorage): VortexViewModelStorage => {
  const result = manager.orderByLoadOrder(loadOrder);
  if (result.result && result.orderedModuleViewModels) {
    return result.orderedModuleViewModels.map((current, index) => createDisplayItem(context, current, index));
  }
  return placeholder ?? [];
}

export const preSort = toBluebird(async (context: types.IExtensionContext, manager: VortexLauncherManager, items: VortexViewModelStorage, updateType: types.UpdateType | undefined): Promise<VortexViewModelStorage> => {
  const modules = manager.getModulesVortex();
  items = items.filter((current) => modules[current.id] !== undefined);
  
  // Create ViewModels if the list is empty
  if (items.length === 0) {
    const loadOrder = getCurrentLoadOrder(manager);
    return fromLoadOrder(context, manager, loadOrder);
  }

  // Just try to order it based on the Load Order from items
  if (updateType === undefined || updateType === 'props-update' || updateType === 'refresh') {
    const loadOrder = getLoadOrderFromDisplayItems(items);
    return fromLoadOrder(context, manager, loadOrder, items);
  }
  
  // Drag And Drop needs to validate first if the new Load Order is valid
  if (updateType === `drag-n-drop`) {
    const currentItems = items.map((current, index) => {
      current.index = index;
      return current;
    });
    const previousItems = items.slice().sort((a, b) => a.index - b.index);
  
    const currentLoadOrder = getLoadOrderFromDisplayItems(currentItems);
    return fromLoadOrder(context, manager, currentLoadOrder, previousItems);
  }

  return items;
});