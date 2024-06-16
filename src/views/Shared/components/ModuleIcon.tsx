import React, { useMemo } from 'react';
import { Utils } from '@butr/vortexextensionnative';
import { IVortexViewModelData } from '../../../types';
import { MODULE_LOGO, TW_LOGO } from '../../../common';
import { TooltipImage } from '.';

export type ModuleIconProps = {
  data: IVortexViewModelData | undefined;
};

export const ModuleIcon = (props: ModuleIconProps): JSX.Element => {
  const { data } = props;

  const isOfficial = data !== undefined && data.moduleInfoExtended.isOfficial;
  const isCommunity = data !== undefined && !data.moduleInfoExtended.isOfficial;

  const dependencies = useMemo(() => (data ? Utils.getDependencyHint(data.moduleInfoExtended) : ''), [data]);

  if (isOfficial) {
    return (
      <TooltipImage
        src={TW_LOGO}
        className="official-module-logo"
        style={{ width: `1.5em`, height: `1.5em` }}
        tooltip={dependencies}
      />
    );
  }

  if (isCommunity) {
    return (
      <TooltipImage
        src={MODULE_LOGO}
        className="community-module-logo"
        style={{ width: `1.5em`, height: `1.5em`, color: `#D69846` }}
        tooltip={dependencies}
      />
    );
  }

  return <TooltipImage src={''} style={{ width: `1.5em`, height: `1.5em` }} tooltip={dependencies} />;
};
