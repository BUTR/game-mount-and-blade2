import { hasSettings, hasSettingsBannerlord } from '..';

export const getSaveFromSettings = (state: unknown, profileId: string) => {
  if (!hasSettings(state)) {
    return null;
  }

  if (!hasSettingsBannerlord(state.settings)) {
    return null;
  }

  let saveId = state.settings.mountandblade2bannerlord?.saveName?.[profileId] ?? null;
  if (saveId === 'No Save') {
    saveId = null;
  }

  return saveId;
};

export const getSortOnDeployFromSettings = (state: unknown, profileId: string) => {
  if (!hasSettings(state)) {
    return null;
  }

  if (!hasSettingsBannerlord(state.settings)) {
    return null;
  }

  return state.settings.mountandblade2bannerlord?.sortOnDeploy?.[profileId];
};
