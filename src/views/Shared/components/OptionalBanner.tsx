import React from 'react';
import { Icon, types } from 'vortex-api';
import { useLocalization } from '../../../utils';
import { IVortexViewModelData } from '../../../types';

export type OptionalBannerProps = {
  item: types.IFBLOLoadOrderEntry<IVortexViewModelData>;
};

export const OptionalBanner = (props: OptionalBannerProps): JSX.Element | null => {
  const { item } = props;

  const { localize: t } = useLocalization();

  return isOptional(item) ? (
    <div className="load-order-unmanaged-banner">
      <Icon className="external-caution-logo" name="feedback-warning" />
      <span className="external-text-area">{t('Not in the collection. Optional')}</span>
    </div>
  ) : null;
};

export const isOptional = (item: types.IFBLOLoadOrderEntry<IVortexViewModelData>): boolean => {
  return item.modId === undefined && item.data !== undefined && !item.data.moduleInfoExtended.isOfficial;
};
