import React from 'react';
import { tooltip } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { IVortexViewModelData } from '../../../types';
import { useLocalization } from '../../../localization';

export type ModuleDuplicatesProps = {
  availableProviders: vetypes.ModuleProviderType[];
  data: IVortexViewModelData | undefined;
};

export const ModuleDuplicates = (props: ModuleDuplicatesProps): JSX.Element => {
  const { availableProviders, data } = props;

  const { localize: t } = useLocalization();

  if (availableProviders.length <= 1) {
    return <div style={{ width: `1.5em`, height: `1.5em` }} />;
  }

  if (data?.moduleInfoExtended.moduleProviderType !== undefined) {
    //const redundantProviders = availableProviders.filter(
    //  (provider) => provider !== item.data?.moduleInfoExtended.moduleProviderType
    //);
    // tooltip={t(`The mod is also installed via ${redundantProviders.join(', ')}!`)}
    return (
      <tooltip.Icon
        className="nexus-id-invalid"
        name="feedback-warning"
        style={{ width: `1.5em`, height: `1.5em` }}
        tooltip={t(
          `{=kfMQEOFS}The Module is installed in the game's /Modules folder and on Steam Workshop!{NL}` +
            `The /Modules version will be used!`
        )}
      />
    );
  }

  return <div style={{ width: `1.5em`, height: `1.5em` }} />;
};
