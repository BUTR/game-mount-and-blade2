import React, { useMemo } from 'react';
import { tooltip } from 'vortex-api';
import { IModuleCompatibilityInfo, IVortexViewModelData } from '../../types';
import { useLauncher, useLocalization, versionToString } from '../../utils';

interface IProps {
  data: IVortexViewModelData | undefined;
  compatibilityInfo: IModuleCompatibilityInfo | undefined;
}

export type CompatibilityInfoProps = IProps;

export const CompatibilityInfo = (props: IProps) => {
  const { compatibilityInfo: compatibilityScore, data } = props;

  const { localize: t } = useLocalization();
  const launcherManager = useLauncher();

  const gameVersion = useMemo(() => launcherManager.getGameVersionVortex(), [launcherManager]);

  if (!compatibilityScore || !data) {
    return <div style={{ width: `1.5em`, height: `1.5em` }} />;
  }

  const hasRecommendation =
    compatibilityScore.recommendedVersion !== undefined && compatibilityScore.recommendedVersion !== null;

  const hint = hasRecommendation
    ? t(
        `{=HdnFwgVB}Based on BUTR analytics:{NL}{NL}Compatibility Score {SCORE}%{NL}{NL}Suggesting to update to {RECOMMENDEDVERSION}.{NL}Compatibility Score {RECOMMENDEDSCORE}%{NL}{NL}{RECOMMENDEDVERSION} has a better compatibility for game {GAMEVERSION} rather than {CURRENTVERSION}!`,
        {
          NL: '\n',
          SCORE: compatibilityScore.score.toString(),
          RECOMMENDEDVERSION: compatibilityScore.recommendedVersion?.toString() ?? '',
          RECOMMENDEDSCORE: compatibilityScore.recommendedScore?.toString() ?? '',
          GAMEVERSION: gameVersion,
          CURRENTVERSION: versionToString(data.moduleInfoExtended.version),
        }
      )
    : t(
        `{=HdnFwgVA}Based on BUTR analytics:{NL}{NL}Update is not requiured.{NL}Compatibility Score {SCORE}%{NL}{NL}{CURRENTVERSION} is one of the best version for game {GAMEVERSION}`,
        {
          NL: '\n',
          SCORE: compatibilityScore.score.toString(),
          CURRENTVERSION: versionToString(data.moduleInfoExtended.version),
          GAMEVERSION: gameVersion,
        }
      );

  const color = compatibilityScore.score >= 75 ? 'green' : compatibilityScore.score >= 50 ? 'yellow' : 'red';

  return (
    <tooltip.Icon style={{ color: color, width: `1.5em`, height: `1.5em` }} name="feedback-error" tooltip={hint} />
  );
};
