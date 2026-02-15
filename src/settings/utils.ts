import { IStateWithBannerlord } from "../types";

export const getSortOnDeployFromSettings = (
  state: IStateWithBannerlord,
  profileId: string,
): boolean | null => {
  return (
    state.settings.mountandblade2bannerlord?.sortOnDeploy?.[profileId] ?? null
  );
};

export const getFixCommonIssuesFromSettings = (
  state: IStateWithBannerlord,
  profileId: string,
): boolean | null => {
  return (
    state.settings.mountandblade2bannerlord?.fixCommonIssues?.[profileId] ??
    null
  );
};

export const getBetaSortingFromSettings = (
  state: IStateWithBannerlord,
  profileId: string,
): boolean | null => {
  return (
    state.settings.mountandblade2bannerlord?.betaSorting?.[profileId] ?? null
  );
};

export const getSaveFromSettings = (
  state: IStateWithBannerlord,
  profileId: string,
): string | null => {
  let saveId =
    state.settings.mountandblade2bannerlord?.saveName?.[profileId] ?? null;
  if (saveId === "No Save") {
    saveId = null;
  }

  return saveId;
};
