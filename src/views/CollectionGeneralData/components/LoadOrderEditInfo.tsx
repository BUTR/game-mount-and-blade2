import React, { useContext } from 'react';
import { FlexLayout, Icon, MainContext } from 'vortex-api';
import { openLoadOrderPage } from '../utils';
import { useLocalization } from '../../../utils';

export const LoadOrderEditInfo = (): JSX.Element => {
  const { localize: t } = useLocalization();

  const context = useContext(MainContext);

  return (
    <FlexLayout type="row" id="collection-edit-loadorder-edit-info-container">
      <FlexLayout.Fixed className="loadorder-edit-info-icon">
        <Icon name="dialog-info" />
      </FlexLayout.Fixed>
      <FlexLayout.Fixed className="collection-edit-loadorder-edit-info">
        {t('You can make changes to this data from the ')}
        <a className="fake-link" onClick={() => openLoadOrderPage(context.api)} title={t('Go to Load Order Page')}>
          {t('Load Order page.')}
        </a>
        {t(
          ' If you believe a load order entry is missing, please ensure the ' +
            'relevant mod is enabled and has been added to the collection.'
        )}
      </FlexLayout.Fixed>
    </FlexLayout>
  );
};
