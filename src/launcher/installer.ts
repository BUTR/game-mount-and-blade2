import { selectors, types } from "vortex-api";
import {
  BannerlordModuleManager,
  NativeLauncherManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import path from "path";
import { readFile } from "node:fs/promises";
import { vortexStoreToLibraryStore } from "./utils";
import { actionsLauncher } from "./actions";
import {
  hasPersistentBannerlordMods,
  hasSessionWithBannerlord,
} from "../vortex";
import {
  AVAILABLE_STORES,
  BINARY_FOLDER_STANDARD,
  BINARY_FOLDER_XBOX,
  GAME_ID,
  OBFUSCATED_BINARIES,
  STEAM_BINARIES_ON_XBOX,
  SUB_MODS_IDS,
} from "../common";
import { LocalizationManager } from "../localization";

export const installModuleAsync = async (
  files: string[],
  destinationPath: string,
  archivePath: string | undefined,
  api: types.IExtensionApi,
  launcherManager: NativeLauncherManager,
): Promise<types.IInstallResult> => {
  const subModuleRelFilePath = files.find((x) => x.endsWith("SubModule.xml"))!;
  const subModuleFilePath = path.join(destinationPath, subModuleRelFilePath);
  const subModuleFile = await readFile(subModuleFilePath, {
    encoding: "utf-8",
  });

  const moduleInfo = BannerlordModuleManager.getModuleInfoWithMetadata(
    subModuleFile,
    vetypes.ModuleProviderType.Default,
    subModuleFilePath,
  );

  if (moduleInfo === undefined) {
    const { localize: t } = LocalizationManager.getInstance(api);
    api.showErrorNotification?.("Error", t("Failed to parse SubModule.xml"));
    return {
      instructions: [],
    };
  }

  const filesWithFullPath = files.map<string>((x) =>
    path.join(destinationPath, x),
  );
  const resultRaw = launcherManager.installModule(filesWithFullPath, [
    moduleInfo,
  ]);
  const result: vetypes.InstallResult = {
    instructions: resultRaw.instructions.map<vetypes.InstallInstruction>(
      (x) => {
        if (x.source !== undefined) {
          x.source = x.source.replace(destinationPath, "");
        }
        return x;
      },
    ),
  };

  const state = api.getState();

  const availableStores = result.instructions.reduce<string[]>(
    (map, current) => {
      if (current.store !== undefined) {
        return map.includes(current.store) ? map : [...map, current.store];
      }
      return map;
    },
    [],
  );

  const hasObfuscatedBinaries =
    await launcherManager.isObfuscatedAsync(moduleInfo);

  let useSteamBinaries = false;

  let useSteamBinariesToggle = false;
  if (hasSessionWithBannerlord(state.session)) {
    useSteamBinariesToggle =
      state.session[GAME_ID].useSteamBinariesOnXbox ?? false;
  }

  const discovery: types.IDiscoveryResult | undefined =
    selectors.currentGameDiscovery(state);
  const store = vortexStoreToLibraryStore(discovery?.store ?? "");
  if (!availableStores.includes(store) && store === "Xbox") {
    if (useSteamBinariesToggle) {
      availableStores.push(store);
      useSteamBinaries = true;
    } else {
      const { localize: t } = LocalizationManager.getInstance(api);

      let modName = "";

      if (archivePath !== undefined && archivePath.length > 0) {
        if (hasPersistentBannerlordMods(state.persistent)) {
          const archiveFileName = path.basename(
            archivePath!,
            path.extname(archivePath!),
          );
          const mod =
            state.persistent.mods.mountandblade2bannerlord[archiveFileName];
          if (mod) {
            modName = mod.attributes?.modName ?? "";
          }
        }
      }
      // Not sure we even can get here
      if (modName.length === 0) {
        modName = result.instructions
          .filter((x) => x.moduleInfo !== undefined)
          .filter((value, index, self) => self.indexOf(value) === index)
          .map<vetypes.ModuleInfoExtended>((x) => x.moduleInfo!)
          .map<string>((x) => `* ${x.name} (${x.id})`)
          .join("\n ");
      }

      const no = t("No, remove the mods");
      const yes = t("Install, I accept the risks");
      const yesForAll = t(
        `Install, I accept the risks. Don't ask again for the current session`,
      );
      const dialogResult = await api.showDialog?.(
        "question",
        t(`Compatibility Issue With Game Pass PC Version of the Game!`),
        {
          message: t(
            `The following mods:
{{ modName }}

Do not provide binaries for Game Pass PC (Xbox)!
Do you want to install binaries for Steam/GOG/Epic version of the game?

Warning! This can lead to issues!`,
            { replace: { modName: modName } },
          ),
        },
        [{ label: no }, { label: yes }, { label: yesForAll }],
      );
      switch (dialogResult?.action) {
        case yes:
          availableStores.push(store);
          useSteamBinaries = true;
          break;
        case yesForAll:
          availableStores.push(store);
          useSteamBinaries = true;
          api.store?.dispatch(actionsLauncher.setUseSteamBinariesOnXbox(true));
          break;
      }
    }
  }

  const subModsIds = Array<string>();
  const transformedResult: types.IInstallResult = {
    instructions: result.instructions.reduce<types.IInstruction[]>(
      (map, current) => {
        switch (current.type) {
          case "Copy":
            map.push({
              type: "copy",
              source: current.source ?? "",
              destination: current.destination ?? "",
            });
            break;
          case "ModuleInfo":
            if (current.moduleInfo) {
              subModsIds.push(current.moduleInfo.id);
            }
            break;
          case "CopyStore":
            if (current.store === store) {
              map.push({
                type: "copy",
                source: current.source ?? "",
                destination: current.destination ?? "",
              });
            }
            if (current.store === "Steam" && useSteamBinaries) {
              map.push({
                type: "copy",
                source: current.source ?? "",
                destination:
                  current.destination?.replace(
                    BINARY_FOLDER_STANDARD,
                    BINARY_FOLDER_XBOX,
                  ) ?? "",
              });
            }
            break;
        }
        return map;
      },
      [],
    ),
  };
  transformedResult.instructions.push({
    type: "attribute",
    key: SUB_MODS_IDS,
    value: subModsIds,
  });
  transformedResult.instructions.push({
    type: "attribute",
    key: AVAILABLE_STORES,
    value: availableStores,
  });
  transformedResult.instructions.push({
    type: "attribute",
    key: STEAM_BINARIES_ON_XBOX,
    value: useSteamBinaries,
  });
  transformedResult.instructions.push({
    type: "attribute",
    key: OBFUSCATED_BINARIES,
    value: hasObfuscatedBinaries,
  });

  return transformedResult;
};
