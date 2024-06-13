import React, { ComponentType, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { More, selectors, Toggle, types } from 'vortex-api';
import { IMoreProps } from 'vortex-api/lib/controls/More';
import {
  getBetaSortingFromSettings,
  getFixCommonIssuesFromSettings,
  getSortOnDeployFromSettings,
  useLocalization,
} from '../../utils';

interface IProps {
  onSetSortOnDeploy: (profileId: string, sort: boolean) => void;
  onSetFixCommonIssues: (profileId: string, fixCommonIssues: boolean) => void;
  onSetBetaSorting: (profileId: string, betaSorting: boolean) => void;
}

export type SettingsProps = IProps;

export const Settings = (props: IProps) => {
  const { onSetSortOnDeploy, onSetFixCommonIssues, onSetBetaSorting } = props;
  const { profileId, autoSortOnDeploy, fixCommonIssues, betaSorting } = useSelector(mapState);
  const setSortCallback = useCallback(
    (value) => {
      if (profileId !== undefined) {
        onSetSortOnDeploy(profileId, value);
      }
    },
    [profileId, onSetSortOnDeploy]
  );
  const fixCommonIssuesCallback = useCallback(
    (value) => {
      if (profileId !== undefined) {
        onSetFixCommonIssues(profileId, value);
      }
    },
    [profileId, onSetFixCommonIssues]
  );
  const betaSortingCallback = useCallback(
    (value) => {
      if (profileId !== undefined) {
        onSetBetaSorting(profileId, value);
      }
    },
    [profileId, onSetBetaSorting]
  );

  const { localize: t } = useLocalization();

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

const mapState = (state: types.IState) => {
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

const MoreWrapper = More as ComponentType<IMoreProps>;
