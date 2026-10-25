import { useContext, useEffect, useState } from "react";
import { MainContext, types } from "@nexusmods/vortex-api";
import { getSaveDetailsAsync, ISaveDetails } from "./saveFile";
import { VortexLauncherManager } from "@bannerlord/core/launcher/manager";

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
