import React from 'react';
import { EmptyPlaceholder } from 'vortex-api';
import { useLocalization } from '../../../localization';
import { OpenLoadOrderButton } from '.';

export const Placeholder = (): JSX.Element => {
  const { localize: t } = useLocalization();

  return (
    <EmptyPlaceholder
      icon="sort-none"
      text={t('You have no load order entries (for the current mods in the collection)')}
      subtext={OpenLoadOrderButton()}
    />
  );
};
