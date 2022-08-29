//@ts-ignore
import Bluebird, { Promise } from 'bluebird';
import { method as toBluebird } from 'bluebird';

import I18next from 'i18next';
import * as React from 'react';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import { More, Toggle, selectors, util } from 'vortex-api';

const NAMESPACE = 'mnb2-settings';

interface IBaseProps {
  t: typeof I18next.t;
  onSetSortOnDeploy: (profileId: string, sort: boolean) => void;
}

interface IConnectedProps {
  profileId: string;
  autoSortOnDeploy: boolean;
}

type IProps = IBaseProps & IConnectedProps;

const Settings = (props: IProps) => {
  const { t, autoSortOnDeploy, onSetSortOnDeploy, profileId } = props;
  const onSetSort = React.useCallback((value) => {
    if (profileId !== undefined) {
      onSetSortOnDeploy(profileId, value);
    }
  }, [onSetSortOnDeploy]);

  return (
    <div>
      <Toggle
        checked={autoSortOnDeploy}
        onToggle={onSetSort}
      >
        {t('Sort Bannerlord mods automatically on deployment')}
        <More id='mnb2-sort-setting' name={t('Running sort on deploy')}>
          {t('Any time you deploy, Vortex will attempt to automatically sort your load order '
           + 'for you to reduce game crashes caused by incorrect module order.\n\n'
           + 'Important: Please ensure to lock any load order entries you wish to stop from '
           + 'shifting positions.')}
        </More>
      </Toggle>
    </div>
  );
}

const mapState = (state: any): IConnectedProps => {
  const profileId: string = selectors.activeProfile(state)?.id;
  return {
    profileId,
    autoSortOnDeploy: util.getSafe(state,
      ['settings', 'mountandblade2', 'sortOnDeploy', profileId], true),
  };
}

export default 
  withTranslation(['common', NAMESPACE])(connect(mapState)(Settings)) as React.ComponentType<IProps>;
