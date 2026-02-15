import React, { FC, useCallback } from "react";
import { useSelector } from "react-redux";
import { More, selectors, Toggle } from "vortex-api";
import { useLocalization } from "../../localization";
import { bselectors } from "../../selectors";
import { IStateWithBannerlord } from "../../types";

export type SettingsProps = {
  onSetSortOnDeploy: (profileId: string, sort: boolean) => void;
  onSetFixCommonIssues: (profileId: string, fixCommonIssues: boolean) => void;
  onSetBetaSorting: (profileId: string, betaSorting: boolean) => void;
};

export const Settings: FC<SettingsProps> = (props) => {
  const { onSetSortOnDeploy, /*onSetFixCommonIssues,*/ onSetBetaSorting } =
    props;

  const profile = useSelector(selectors.activeProfile);
  const autoSortOnDeploy = useSelector(
    (state: IStateWithBannerlord) =>
      bselectors.sortOnDeployForProfile(state, profile!.id) ?? true,
  );
  /*const fixCommonIssues = useSelector(
    (state: IStateWithBannerlord) =>
      fixCommonIssuesForProfile(state, profile!.id) ?? true,
  );*/
  const betaSorting = useSelector(
    (state: IStateWithBannerlord) =>
      bselectors.betaSortingForProfile(state, profile!.id) ?? false,
  );

  const setSortCallback = useCallback(
    (value: boolean): void => {
      if (profile) {
        onSetSortOnDeploy(profile.id, value);
      }
    },
    [profile, onSetSortOnDeploy],
  );
  /*
  const fixCommonIssuesCallback = useCallback(
    (value: boolean): void => {
      if (profile) {
        onSetFixCommonIssues(profile.id, value);
      }
    },
    [profile, onSetFixCommonIssues],
  );
  */
  const betaSortingCallback = useCallback(
    (value: boolean): void => {
      if (profile) {
        onSetBetaSorting(profile.id, value);
      }
    },
    [profile, onSetBetaSorting],
  );

  const { localize: t } = useLocalization();

  return (
    <div>
      <Toggle checked={autoSortOnDeploy} onToggle={setSortCallback}>
        {t(`Sort Bannerlord mods automatically on deployment`)}
        <More id="mnb2-sort-setting" name={t(`Running sort on deploy`)}>
          {t(
            `Any time you deploy, Vortex will attempt to automatically sort your load order ` +
              `for you to reduce game crashes caused by incorrect module order.\n\n` +
              `Important: Please ensure to lock any load order entries you wish to stop from ` +
              `shifting positions.`,
          )}
        </More>
      </Toggle>
      {/*
      <Toggle checked={fixCommonIssues} onToggle={fixCommonIssuesCallback}>
        {t(`{=LXlsSS8t}Fix Common Issues`)}
        <More id="mnb2-fix-common-issues-setting" name={t(`{=LXlsSS8t}Fix Common Issues`)}>
          {t(`{=J9VbkLW4}Fixes issues like 0Harmony.dll being in the /bin folder`)}
        </More>
      </Toggle>
      */}
      <Toggle checked={betaSorting} onToggle={betaSortingCallback}>
        {t(`{=QJSBiZdJ}Beta Sorting`)}
        <More
          id="mnb2-beta-sorting-setting"
          name={t(`{=QJSBiZdJ}Beta Sorting`)}
        >
          {t(
            `{=HVhaqeb4}Uses the new sorting algorithm after v1.12.x. Disable to use the old algorithm`,
          )}
        </More>
      </Toggle>
    </div>
  );
};
