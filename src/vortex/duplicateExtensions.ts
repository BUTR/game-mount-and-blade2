import { actions, log, types } from "@nexusmods/vortex-api";
import path from "path";
import { LocalizationManager } from "../localization/manager";
import { config, version } from "../../package.json";

const isSamePath = (lhs: string, rhs: string): boolean =>
  path.resolve(lhs).toLowerCase() === path.resolve(rhs).toLowerCase();

/**
 * The major, minor and patch numbers of a version, undefined when it has none
 */
const parseVersion = (value: string | undefined): number[] | undefined => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value ?? "");
  return match ? match.slice(1, 4).map(Number) : undefined;
};

/**
 * A copy without a readable version is left alone, it can't be told apart from a newer one
 */
const isOlderThanThis = (copyVersion: string | undefined): boolean => {
  const copy = parseVersion(copyVersion);
  const current = parseVersion(version);
  if (copy === undefined || current === undefined) {
    return false;
  }
  const difference = copy.findIndex((part, i) => part !== current[i]);
  return difference !== -1 && copy[difference]! < current[difference]!;
};

/**
 * Vortex tells extensions apart by folder name, so an old copy installed under another folder loads next to this one.
 * Old copies carry a native library current Vortex can't load and fail every load order read, the user is asked to
 * remove them. Only the newest copy asks, so two current copies don't ask to remove each other
 */
const warnAboutOtherCopiesOrThrow = (api: types.IExtensionApi): void => {
  const copies = (api.getLoadedExtensions?.() ?? []).filter(
    (extension) =>
      extension.info?.name === config.extensionName &&
      typeof extension.path === "string" &&
      !isSamePath(extension.path, __dirname) &&
      isOlderThanThis(extension.info.version),
  );
  if (copies.length === 0) {
    return;
  }

  log("warn", "Other copies of the Bannerlord extension are loaded", {
    copies: copies.map((copy) => ({
      path: copy.path,
      version: copy.info?.version,
    })),
  });

  // Copies placed in the plugins folder by hand are loaded without an entry Vortex can remove
  const extensions = api.getState().app?.extensions ?? {};
  const extensionIds = Object.keys(extensions).filter((id) => {
    const extensionPath = extensions[id]?.path;
    return (
      typeof extensionPath === "string" &&
      copies.some((copy) => isSamePath(copy.path, extensionPath))
    );
  });

  const { localize: t } = LocalizationManager.getInstance(api);
  const versions = copies.map((copy) => copy.info?.version ?? "?").join(", ");
  const removeAction: types.INotificationAction = {
    title: t("Remove"),
    action: (dismiss) => {
      for (const id of extensionIds) {
        api.store?.dispatch(actions.removeExtension(id));
      }
      dismiss();
      api.sendNotification?.({
        id: "bannerlord-other-copies-removed",
        type: "info",
        message: t(
          "Restart Vortex to finish removing the old Bannerlord extension",
        ),
      });
    },
  };
  const openExtensionsAction: types.INotificationAction = {
    title: t("Open Extensions"),
    action: () => api.events.emit("show-main-page", "extensions"),
  };

  api.sendNotification?.({
    id: "bannerlord-other-copies",
    type: "warning",
    title: t("Another copy of the Bannerlord extension is installed"),
    message: t(
      "Version {{versions}} is loaded next to {{version}} and breaks the load order. Remove it and restart Vortex",
      { versions, version },
    ),
    actions:
      extensionIds.length > 0
        ? [removeAction, openExtensionsAction]
        : [openExtensionsAction],
  });
};

/**
 * Runs during startup, a failure to check is logged and never stops the extension from starting
 */
export const warnAboutOtherCopies = (api: types.IExtensionApi): void => {
  try {
    warnAboutOtherCopiesOrThrow(api);
  } catch (err) {
    log("warn", "Failed to check for other copies of the extension", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
