import React from 'react';
import { IssueSnippet } from './IssueSnippet';
import { ISaveGame } from '../types';
import { useLocalization } from '../../../localization';

export type SidebarProps = {
  save: ISaveGame | null;
};

export const Sidebar = (props: SidebarProps): JSX.Element => {
  const { save } = props;

  const { localize: t } = useLocalization();

  // if nothing is selected
  if (!save) {
    return <></>;
  }

  // something is selected
  return (
    <>
      {<h3>{save.name}</h3>}
      {IssueSnippet({
        issueHeading: t('{=HvvA78sZ}Load Order Issues:{NL}{LOADORDERISSUES}', {
          NL: '',
          LOADORDERISSUES: '',
        }),
        issue: save.loadOrderIssues,
      })}
      {IssueSnippet({
        issueHeading: t('{=GtDRbC3m}Missing Modules:{NL}{MODULES}', {
          NL: '',
          MODULES: '',
        }),
        issue: save.missingModules,
      })}
      {IssueSnippet({
        issueHeading: t('{=vCwH9226}Duplicate Module Names:{NL}{MODULENAMES}', {
          NL: '',
          MODULENAMES: '',
        }),
        issue: save.duplicateModules,
      })}
      {IssueSnippet({
        issueHeading: t('{=BuMom4Jt}Mismatched Module Versions:{NL}{MODULEVERSIONS}', {
          NL: '',
          MODULEVERSIONS: '',
        }),
        issue: save.mismatchedModuleVersions,
      })}
    </>
  );
};
