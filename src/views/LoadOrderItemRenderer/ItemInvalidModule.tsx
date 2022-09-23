/*
import * as React from 'react';
import * as BS from 'react-bootstrap';
import { types, tooltip } from "vortex-api";
import { getModuleIssues } from '../../utils/subModCache';

export type ItemInvalidModuleProps = {
    item: types.ILoadOrderDisplayItem,
};

export const ItemInvalidModule = (props: ItemInvalidModuleProps): JSX.Element => {
  const { item } = props;
  
  const issues = getModuleIssues(item.id);
  const issuesText = issues.map((issue) => issue.reason).join(`\n`);
  
  return (
    <BS.Checkbox checked={false} disabled={true}>
      <tooltip.Icon style={{ color: `red` }} name='feedback-error' tooltip={issuesText} />
      {item.name}
    </BS.Checkbox>
  );
};
*/