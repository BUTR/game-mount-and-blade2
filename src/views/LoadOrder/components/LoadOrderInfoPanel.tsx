import React, { useCallback } from 'react';
import { tooltip, util } from 'vortex-api';
import { useLocalization } from '../../../utils';

export type LoadOrderInfoPanelProps = {
  refresh: () => void;
};

export const LoadOrderInfoPanel = (props: LoadOrderInfoPanelProps): JSX.Element => {
  const { refresh } = props;

  const { localize: t } = useLocalization();

  const openWiki = useCallback(() => {
    util.opn(`https://wiki.nexusmods.com/index.php/Modding_Bannerlord_with_Vortex`).catch(() => null);
  }, []);
  const hint = t(
    `{=zXWdahH9}Get Update Recommendations{NL}Clicking on this button will send your module list to the BUTR server to get compatibility scores and recommended versions.{NL}They are based on the crash reports from ButterLib.{NL}{NL}(Requires Internet Connection)`,
    {
      NL: '\n',
    }
  );
  return (
    <>
      <p>
        <tooltip.Button tooltip={hint} onClick={refresh}>
          {t('Update Compatibility Score')}
        </tooltip.Button>
      </p>
      <p>
        {t(
          `You can adjust the load order for Bannerlord by dragging and dropping mods up or down on this page. ` +
            `For more information and help see: `
        )}
        <a onClick={openWiki}>{t(`Modding Bannerlord with Vortex.`)}</a>
      </p>
      <p>
        {t(`How to use:`)}
        <ul>
          <li>{t(`Check the box next to the mods you want to be active in the game.`)}</li>
          <li>{t(`Click Auto Sort in the toolbar. (See below for details).`)}</li>
          <li>
            {t(
              `Make sure to run the game directly via the Play button in the top left corner ` +
                `(on the Bannerlord tile). Your Vortex load order may not be loaded if you run the Single Player game through the game launcher.`
            )}
          </li>
          <li>
            {t(
              `Otherwise to properly run the game with the selected mods from Vortex, either run without a primary tool set or use 'Bannerlord Software Extended'` +
                `when BLSE is installed or use 'Official Bannerlord' when BLSE is not installed.`
            )}
          </li>
          <li>
            {t(
              `Optional: Manually drag and drop mods to different positions in the load order (for testing different overrides). Mods further down the list override mods further up.`
            )}
          </li>
        </ul>
      </p>
      <div>
        <p>
          {t(`Please note:`)}
          <ul>
            <li>
              {t(
                `The load order reflected here will only be loaded if you run the game through Vortex's default starter for Bannerlord. ` +
                  `If you have a different tool set as the primary starter, please unassign it in the tools dashlet on the dashboard. `
              )}
            </li>
            <li>
              {t(
                `Auto Sort uses Aragas's Bannerlord Mod Sorter. It will sort your mods based on the dependencies defined by the mods themselves. `
              )}
            </li>
            <li>
              {t(
                `If you cannot see your mod in this load order, Vortex may have been unable to find or parse its SubModule.xml file. ` +
                  `Most - but not all mods - come with or need a SubModule.xml file.`
              )}
            </li>
            <li>{t(`Hit the deploy button whenever you install and enable a new mod.`)}</li>
            <li>
              {t(
                `The game will not launch unless the game store (Steam, Epic, etc) is started beforehand. If you're getting the ` +
                  `"Unable to Initialize Steam API" error, restart Steam.`
              )}
            </li>
          </ul>
        </p>
      </div>
    </>
  );
};
