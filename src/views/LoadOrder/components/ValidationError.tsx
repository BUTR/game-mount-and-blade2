import React from 'react';
import { tooltip, types } from 'vortex-api';
import { IVortexViewModelData } from '../../../types';

export type ValidationErrorProps = {
  invalidEntries: types.IFBLOInvalidResult[] | undefined;
  item: types.IFBLOLoadOrderEntry<IVortexViewModelData>;
};

export const ValidationError = (props: ValidationErrorProps): JSX.Element | null => {
  const { invalidEntries, item } = props;
  const invalidEntryList = invalidEntries
    ? invalidEntries
        .filter((inv) => inv.id.toLowerCase() === item.id.toLowerCase())
        .map((x) => x.reason)
        .join('\n')
    : undefined;
  return invalidEntryList !== undefined && invalidEntryList.length ? (
    <tooltip.Icon
      className="fblo-invalid-entry"
      name="feedback-error"
      style={{ width: `1.5em`, height: `1.5em` }}
      tooltip={invalidEntryList}
    />
  ) : null;
};
