import React from 'react';
import { Icon, types } from 'vortex-api';
import { IVortexViewModelData } from '../../../types';
import { isExternal } from '../utils';
import { useLocalization } from '../../../localization';

export type ExternalBannerProps = {
  item: types.IFBLOLoadOrderEntry<IVortexViewModelData>;
};

export const ExternalBanner = (props: ExternalBannerProps): JSX.Element | null => {
  const { item } = props;

  const { localize: t } = useLocalization();

  return isExternal(item) ? (
    <div className="load-order-unmanaged-banner">
      <Icon className="external-caution-logo" name="feedback-warning" />
      <span className="external-text-area">{t('Not managed by Vortex')}</span>
    </div>
  ) : null;
};
