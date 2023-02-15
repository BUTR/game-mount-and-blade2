import * as React from 'react';
import { tooltip } from "vortex-api";
import { types as vetypes } from '@butr/vortexextensionnative';
import { VortexViewModel } from '../../types';

export type IconIssuesProps = {
  item: VortexViewModel,
  issues: vetypes.ModuleIssue[],
};

export const IconIssues = (props: IconIssuesProps): JSX.Element | null => {
  const { item, issues } = props;

  const incompatible = issues.map((issue) => issue.reason).join(`\n`);
  
  return (!item.isValid && issues.length > 0)
    ? <tooltip.Icon name='feedback-warning' tooltip={incompatible} style={{ color: `red`, marginRight: `10` }} />
    : null;
};