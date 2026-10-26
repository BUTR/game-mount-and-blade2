import { promises as fs } from "fs";
import { useContext, useEffect, useState } from "react";
import { MainContext, types } from "@nexusmods/vortex-api";
import {
  ISaveDetails,
  readSaveDetailsInWorkerAsync,
} from "@bannerlord/save-file";
import { VortexLauncherManager } from "@bannerlord/core/launcher/manager";

const cache = new Map<string, Promise<ISaveDetails>>();

/**
 * The save's details, read once per version of the file. Empty when the save can't be read
 */
const getSaveDetailsAsync = async (filePath: string): Promise<ISaveDetails> => {
  try {
    const stat = await fs.stat(filePath);
    const key = `${filePath}|${stat.mtimeMs}|${stat.size}`;
    let details = cache.get(key);
    if (details === undefined) {
      // Off the renderer's thread, decoding the save is heavy
      details = readSaveDetailsInWorkerAsync(filePath).catch(() => ({}));
      cache.set(key, details);
    }
    return await details;
  } catch {
    return {};
  }
};

/**
 * The details of the save with the name that its metadata doesn't have, empty when they can't be read
 */
export const getSaveDetailsByNameAsync = async (
  api: types.IExtensionApi,
  saveName: string,
): Promise<ISaveDetails> => {
  try {
    const filePath =
      await VortexLauncherManager.getInstance(api).getSaveFilePathAsync(
        saveName,
      );
    return filePath ? await getSaveDetailsAsync(filePath) : {};
  } catch {
    return {};
  }
};

/**
 * The selected save's details, read from the save in the background. Undefined while reading
 */
export const useSaveDetails = (
  saveName: string | undefined,
): ISaveDetails | undefined => {
  const { api } = useContext(MainContext);
  const [details, setDetails] = useState<{
    saveName: string;
    details: ISaveDetails;
  } | null>(null);

  useEffect(() => {
    if (saveName === undefined) {
      return;
    }
    let current = true;
    void getSaveDetailsByNameAsync(api, saveName).then((read) => {
      if (current) {
        setDetails({ saveName, details: read });
      }
    });
    return () => {
      current = false;
    };
  }, [api, saveName]);

  return details !== null && details.saveName === saveName
    ? details.details
    : undefined;
};
