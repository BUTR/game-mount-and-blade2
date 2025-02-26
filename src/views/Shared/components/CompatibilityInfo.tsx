import React, { useContext, useEffect, useState } from 'react';
import { MainContext, tooltip } from 'vortex-api';
import { IVortexViewModelData } from '../../../types';
import { IModuleCompatibilityInfo } from '../../../butr';
import { useLocalization } from '../../../localization';
import { useLauncher, versionToString } from '../../../launcher';

export type CompatibilityInfoProps = {
  data: IVortexViewModelData | undefined;
  compatibilityInfo: IModuleCompatibilityInfo | undefined;
};

export const CompatibilityInfo = (props: CompatibilityInfoProps): JSX.Element => {
  const { compatibilityInfo, data } = props;

  const context = useContext(MainContext);
  const { localize: t } = useLocalization();
  const launcherManager = useLauncher();

  const [gameVersion, setGameVersion] = useState<string | null>(null);

  useEffect(() => {
    const fetchGameVersion = async (): Promise<void> => {
      try {
        const version = await launcherManager.getGameVersionVortexAsync();
        setGameVersion(version);
      } catch (err) {
        setGameVersion(null);
        context.api.showErrorNotification?.(t('Failed to import added file to mod!'), err);
      }
    };

    void fetchGameVersion();
  }, [context.api, t, launcherManager]);

  if (!compatibilityInfo || !data || gameVersion === null) {
    return <div style={{ width: `1.5em`, height: `1.5em` }} />;
  }

  const hasRecommendation =
    compatibilityInfo.recommendedVersion !== null && compatibilityInfo.recommendedVersion !== null;

  const hint = hasRecommendation
    ? t(
        `{=HdnFwgVB}Based on BUTR analytics:{NL}{NL}Compatibility Score {SCORE}%{NL}{NL}Suggesting to update to {RECOMMENDEDVERSION}.{NL}Compatibility Score {RECOMMENDEDSCORE}%{NL}{NL}{RECOMMENDEDVERSION} has a better compatibility for game {GAMEVERSION} rather than {CURRENTVERSION}!`,
        {
          NL: '\n',
          SCORE: compatibilityInfo.score.toString(),
          RECOMMENDEDVERSION: compatibilityInfo.recommendedVersion?.toString() ?? '',
          RECOMMENDEDSCORE: compatibilityInfo.recommendedScore?.toString() ?? '',
          GAMEVERSION: gameVersion,
          CURRENTVERSION: versionToString(data.moduleInfoExtended.version),
        }
      )
    : t(
        `{=HdnFwgVA}Based on BUTR analytics:{NL}{NL}Update is not requiured.{NL}Compatibility Score {SCORE}%{NL}{NL}{CURRENTVERSION} is one of the best version for game {GAMEVERSION}`,
        {
          NL: '\n',
          SCORE: compatibilityInfo.score.toString(),
          CURRENTVERSION: versionToString(data.moduleInfoExtended.version),
          GAMEVERSION: gameVersion,
        }
      );

  const color = compatibilityInfo.score >= 75 ? 'green' : compatibilityInfo.score >= 50 ? 'yellow' : 'red';

  return (
    <tooltip.Icon style={{ color: color, width: `1.5em`, height: `1.5em` }} name="feedback-error" tooltip={hint} />
  );
};
