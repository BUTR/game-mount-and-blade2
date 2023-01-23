import * as React from 'react';
import { types, tooltip } from "vortex-api";
import { types as vetypes } from '@butr/vortexextensionnative';

export type IconIssuesProps = {
  item: types.ILoadOrderDisplayItem,
  issues: vetypes.ModuleIssue[],
};

export const IconIssues = (props: IconIssuesProps): JSX.Element | null => {
  const { item, issues } = props;

  const incompatible = issues.map((issue) => issue.reason).join(`\n`);
  
  return (issues.length > 0)
    ? <tooltip.Icon name='feedback-warning' tooltip={incompatible} style={{ color: `red`, marginRight: `10` }} />
    : null;
};