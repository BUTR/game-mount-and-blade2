import { selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "@bannerlord/core/common";
import { VortexLauncherManager } from "@bannerlord/core/launcher/manager";
import { LoadOrderManager } from "@bannerlord/core/loadOrder/manager";
import { toggleLoadOrderAsync } from "@bannerlord/core/loadOrder/utils";
import {
  BannerlordLoadOrderButton,
  BannerlordLoadOrderButtonProps,
} from "../views/LoadOrder/components/BannerlordLoadOrderButton";
import {
  FetchCompatibilityButton,
  FetchCompatibilityButtonProps,
} from "../views/LoadOrder/components/FetchCompatibilityButton";
import { LoadOrderInfoPanel } from "../views/LoadOrder/components/LoadOrderInfoPanel";
import { LoadOrderItemRenderer } from "../views/LoadOrder/components/LoadOrderItemRenderer";

export const registerLoadOrder = (context: types.IExtensionContext): void => {
  const loadOrderManager = LoadOrderManager.getInstance(context.api);
  loadOrderManager.usageInstructions = () =>
    LoadOrderInfoPanel({
      refreshAsync: loadOrderManager.updateCompatibilityScoresAsync,
    });
  loadOrderManager.customItemRenderer = ({ className = "", item }) =>
    LoadOrderItemRenderer({
      item: item,
      className: className,
      availableProviders: loadOrderManager.getAvailableProviders(
        item.loEntry.id,
      ),
      compatibilityInfo: loadOrderManager.getCompatibilityInfo(item.loEntry.id),
    });
  context.registerLoadOrder(/*gameInfo:*/ loadOrderManager);

  const isMB2 = (): boolean =>
    selectors.activeGameId(context.api.getState()) === GAME_ID;

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 200,
    /*iconOrComponent:*/ `loot-sort`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Auto Sort`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      const launcherManager = VortexLauncherManager.getInstance(context.api);
      void launcherManager.autoSortAsync();
    },
    /*condition?:*/ isMB2,
  );

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 210,
    /*iconOrComponent:*/ `checkbox-checked`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Enable All Mods`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      void toggleLoadOrderAsync(context.api, true);
    },
    /*condition?:*/ isMB2,
  );

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 215,
    /*iconOrComponent:*/ `checkbox-unchecked`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Disable All Mods`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      void toggleLoadOrderAsync(context.api, false);
    },
    /*condition?:*/ isMB2,
  );

  // Vortex's own Load Order import/export dropdown can't be extended, so this is a second one. The page's own buttons
  // have no position and sort as 100, ahead of registered actions, so 100 puts it right after them
  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 100,
    /*iconOrComponent:*/ BannerlordLoadOrderButton,
    /*options:*/ {},
    /*titleOrProps?:*/ (): BannerlordLoadOrderButtonProps => {
      const launcherManager = VortexLauncherManager.getInstance(context.api);
      return {
        importNovusAsync: () => launcherManager.importModuleListAsync("novus"),
        importLauncherExAsync: () =>
          launcherManager.importModuleListAsync("launcherex"),
        exportLauncherExAsync: () =>
          launcherManager.exportModuleListAsync("launcherex"),
      };
    },
    /*actionOrCondition?:*/ isMB2,
  );

  // A component rather than an icon name so the button can have a tooltip; for components the 5th argument is the props
  // factory and the 6th the condition
  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 201,
    /*iconOrComponent:*/ FetchCompatibilityButton,
    /*options:*/ {},
    /*titleOrProps?:*/ (): FetchCompatibilityButtonProps => ({
      refreshAsync: loadOrderManager.updateCompatibilityScoresAsync,
    }),
    /*actionOrCondition?:*/ isMB2,
  );
};
