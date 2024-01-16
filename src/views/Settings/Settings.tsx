import React from 'react';
import { useSelector } from 'react-redux';
import I18next from 'i18next';
import { More, Toggle, selectors, types } from 'vortex-api';
import { hasSettingsBannerlord } from '../../utils';

interface IBaseProps {
  t: typeof I18next.t;
  onSetSortOnDeploy: (profileId: string, sort: boolean) => void;
}

interface IConnectedProps {
  profileId: string;
  autoSortOnDeploy: boolean;
}

export type SettingsProps = IBaseProps & IConnectedProps;

const MoreWrapper = More as any;
export const Settings = (props: IBaseProps): JSX.Element => {
  const { t, onSetSortOnDeploy } = props;
  const { profileId, autoSortOnDeploy } = useSelector(mapState);
  const onSetSort = React.useCallback(
    (value) => {
      if (profileId !== undefined) {
        onSetSortOnDeploy(profileId, value);
      }
    },
    [profileId, onSetSortOnDeploy]
  );

  return (
    <div>
      <Toggle checked={autoSortOnDeploy} onToggle={onSetSort}>
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
    </div>
  );
};

const mapState = (state: types.IState): IConnectedProps => {
  const profileId = selectors.activeProfile(state).id;
  let autoSortOnDeploy = true;
  if (hasSettingsBannerlord(state.settings)) {
    autoSortOnDeploy = state.settings.mountandblade2bannerlord?.sortOnDeploy[profileId] ?? true;
  }
  return {
    profileId,
    autoSortOnDeploy: autoSortOnDeploy,
  };
};

export default Settings;
