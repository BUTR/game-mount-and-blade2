import React from 'react';
import { tooltip, types } from 'vortex-api';
import { ISaveGame } from '../types';
import { LocalizationManager } from '../../../localization';

export type StatusViewProps = {
  api: types.IExtensionApi;
  save: ISaveGame;
};

// Custom Renderer has no Context access
export const StatusView = (props: StatusViewProps): JSX.Element => {
  const appendIssues = (allIssues: string[], issues: string[] | undefined, message: string): void => {
    if (issues && issues.length) {
      allIssues.push(`${issues.length} ${message}`);
    }
  };

  const { api, save } = props;

  const { localize: t } = LocalizationManager.getInstance(api);

  const allIssues: string[] = [];
  appendIssues(allIssues, save.loadOrderIssues, t('load order issues'));
  appendIssues(allIssues, save.missingModules, t('missing modules'));
  appendIssues(allIssues, save.duplicateModules, t('duplicate modules'));
  appendIssues(allIssues, save.mismatchedModuleVersions, t('version mismatches'));

  const icon = allIssues.length === 0 ? 'toggle-enabled' : 'feedback-warning';
  const color = allIssues.length === 0 ? 'var(--brand-success)' : 'var(--brand-danger)';

  return <tooltip.Icon name={icon} tooltip={allIssues.join('\n')} style={{ color: color }} />;
};
