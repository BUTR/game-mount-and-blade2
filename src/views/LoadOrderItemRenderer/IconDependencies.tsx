import * as React from 'react';
import { tooltip } from "vortex-api";
import { types as vetypes } from '@butr/vortexextensionnative';
import { BannerlordModuleManager } from '@butr/vortexextensionnative';
import { getVersion } from '../../utils/util';
import { VortexViewModel } from '../../types';

export type IconDependenciesProps = {
  item: VortexViewModel,
};

const moduleInfoString = (metadata : vetypes.DependentModuleMetadata): string => {
  return `${metadata.id}${getVersion(metadata)}${metadata.isOptional ? " (optional)" : ""}`;
}

export const IconDependencies = (props: IconDependenciesProps): JSX.Element | null => {
  const { item } = props;

  const loadBefore = BannerlordModuleManager.getDependenciesToLoadBeforeThis(item.moduleInfo).map(x => moduleInfoString(x));
  const loadAfter = BannerlordModuleManager.getDependenciesToLoadAfterThis(item.moduleInfo).map(x => moduleInfoString(x));
  const incompatible = BannerlordModuleManager.getDependenciesIncompatibles(item.moduleInfo).map(x => moduleInfoString(x));
  const text = `
${loadBefore.length > 0 ? `Load Before:\n\t${loadBefore.join("\n\t")}` : ""}
${loadAfter.length > 0 ? `Load After:\n\t${loadAfter.join("\n\t")}` : ""}
${incompatible.length > 0 ? `Incompatible With:\n\t${incompatible.join("\n\t")}` : ""}
`;
  
  return <tooltip.Icon name='feedback-warning' tooltip={text} style={{ color: `orange`, marginRight: `10` }} />
};