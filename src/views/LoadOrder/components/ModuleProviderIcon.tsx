import React from 'react';
import { IVortexViewModelData } from '../../../types';
import { TooltipImage } from '../../Shared';
import { STEAM_LOGO } from '../../../common';
import { isSteamWorksop } from '../utils';
import { useLocalization } from '../../../localization';

export type ModuleProviderIconProps = {
  data: IVortexViewModelData | undefined;
};

export const ModuleProviderIcon = (props: ModuleProviderIconProps): JSX.Element => {
  const { data } = props;

  const { localize: t } = useLocalization();

  if (isSteamWorksop(data)) {
    return (
      <TooltipImage src={STEAM_LOGO} style={{ width: `1.5em`, height: `1.5em` }} tooltip={t('Managed by Steam')} />
    );
  }

  return <div style={{ width: `1.5em`, height: `1.5em` }} />;
};
