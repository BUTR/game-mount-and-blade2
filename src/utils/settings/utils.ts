import { types } from 'vortex-api';
import { ISettingsWithBannerlord } from './types';
import { hasSettings } from '../vortex';
import { GAME_ID } from '../../common';

const hasSettingsBannerlord = (settings: types.ISettings): settings is ISettingsWithBannerlord => GAME_ID in settings;

export const getSortOnDeployFromSettings = (state: object, profileId: string): boolean | null => {
  if (!hasSettings(state)) {
    return null;
  }

  if (!hasSettingsBannerlord(state.settings)) {
    return null;
  }

  return state.settings.mountandblade2bannerlord?.sortOnDeploy?.[profileId] ?? null;
};

export const getFixCommonIssuesFromSettings = (state: object, profileId: string): boolean | null => {
  if (!hasSettings(state)) {
    return null;
  }

  if (!hasSettingsBannerlord(state.settings)) {
    return null;
  }

  return state.settings.mountandblade2bannerlord?.fixCommonIssues?.[profileId] ?? null;
};

export const getBetaSortingFromSettings = (state: object, profileId: string): boolean | null => {
  if (!hasSettings(state)) {
    return null;
  }

  if (!hasSettingsBannerlord(state.settings)) {
    return null;
  }

  return state.settings.mountandblade2bannerlord?.betaSorting?.[profileId] ?? null;
};

export const getSaveFromSettings = (state: object, profileId: string): string | null => {
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
