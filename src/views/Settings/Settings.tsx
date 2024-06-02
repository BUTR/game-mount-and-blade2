import React from 'react';
import { useSelector } from 'react-redux';
import { More, Toggle, selectors, types } from 'vortex-api';
import { getBetaSortingFromSettings, getFixCommonIssuesFromSettings, getSortOnDeployFromSettings } from '../../utils';
import { IMoreProps } from 'vortex-api/lib/controls/More';
import { GetLocalizationManager } from '../../types';

export interface ISettingsProps {
  getLocalizationManager: GetLocalizationManager;
  onSetSortOnDeploy: (profileId: string, sort: boolean) => void;
  onSetFixCommonIssues: (profileId: string, fixCommonIssues: boolean) => void;
  onSetBetaSorting: (profileId: string, betaSorting: boolean) => void;
}

interface IConnectedProps {
  profileId: string;
  autoSortOnDeploy: boolean;
  fixCommonIssues: boolean;
  betaSorting: boolean;
}

const MoreWrapper = More as React.ComponentType<IMoreProps>;

export const Settings = (props: ISettingsProps): JSX.Element => {
  const { getLocalizationManager, onSetSortOnDeploy, onSetFixCommonIssues, onSetBetaSorting } = props;
  const { profileId, autoSortOnDeploy, fixCommonIssues, betaSorting } = useSelector(mapState);
  const setSortCallback = React.useCallback(
    (value) => {
      if (profileId !== undefined) {
        onSetSortOnDeploy(profileId, value);
      }
    },
    [profileId, onSetSortOnDeploy]
  );
  const fixCommonIssuesCallback = React.useCallback(
    (value) => {
      if (profileId !== undefined) {
        onSetFixCommonIssues(profileId, value);
      }
    },
    [profileId, onSetFixCommonIssues]
  );
  const betaSortingCallback = React.useCallback(
    (value) => {
      if (profileId !== undefined) {
        onSetBetaSorting(profileId, value);
      }
    },
    [profileId, onSetBetaSorting]
  );

  const localizationManager = getLocalizationManager();
  const t = localizationManager.localize;
  return (
    <div>
      <Toggle checked={autoSortOnDeploy} onToggle={setSortCallback}>
        {t(`Sort Bannerlord mods automatically on deployment`)}
        <MoreWrapper id="mnb2-sort-setting" name={t(`Running sort on deploy`)}>
          {t(
            `Any time you deploy, Vortex will attempt to automatically sort your load order ` +
              `for you to reduce game crashes caused by incorrect module order.\n\n` +
              `Important: Please ensure to lock any load order entries you wish to stop from ` +
              `shifting positions.`
          )}
        </MoreWrapper>
      </Toggle>
      {/*
      <Toggle checked={fixCommonIssues} onToggle={fixCommonIssuesCallback}>
        {t(`{=LXlsSS8t}Fix Common Issues`)}
        <MoreWrapper id="mnb2-fix-common-issues-setting" name={t(`{=LXlsSS8t}Fix Common Issues`)}>
          {t(`{=J9VbkLW4}Fixes issues like 0Harmony.dll being in the /bin folder`)}
        </MoreWrapper>
      </Toggle>
      */}
      <Toggle checked={betaSorting} onToggle={betaSortingCallback}>
        {t(`{=QJSBiZdJ}Beta Sorting`)}
        <MoreWrapper id="mnb2-beta-sorting-setting" name={t(`{=QJSBiZdJ}Beta Sorting`)}>
          {t(`{=HVhaqeb4}Uses the new sorting algorithm after v1.12.x. Disable to use the old algorithm`)}
        </MoreWrapper>
      </Toggle>
    </div>
  );
};

const mapState = (state: types.IState): IConnectedProps => {
  const profile = selectors.activeProfile(state);
  const sortOnDeploy = getSortOnDeployFromSettings(state, profile.id) ?? true;
  const fixCommonIssues = getFixCommonIssuesFromSettings(state, profile.id) ?? true;
  const betaSorting = getBetaSortingFromSettings(state, profile.id) ?? false;
  return {
    profileId: profile.id,
    autoSortOnDeploy: sortOnDeploy,
    fixCommonIssues: fixCommonIssues,
    betaSorting: betaSorting,
  };
};

export default Settings;
