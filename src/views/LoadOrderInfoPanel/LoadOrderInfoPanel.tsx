import React from 'react';
import { util } from 'vortex-api';
import { useTranslation } from 'react-i18next';
import { I18N_NAMESPACE } from '../../common';

interface IBaseProps {
  refresh: () => void;
}

export function LoadOrderInfoPanel(props: IBaseProps) {
  const [t] = useTranslation(I18N_NAMESPACE);
  const openWiki = React.useCallback(() => {
    util.opn(`https://wiki.nexusmods.com/index.php/Modding_Bannerlord_with_Vortex`).catch(() => null);
  }, []);
  return (
      <>
        <p>
          {t(`You can adjust the load order for Bannerlord by dragging and dropping mods up or down on this page. `
           + `For more information and help see: `)}
          <a onClick={openWiki}>{t(`Modding Bannerlord with Vortex.`)}</a>
        </p>
          <p>
            {t(`How to use:`)}
            <ul>
              <li>{t(`Check the box next to the mods you want to be active in the game.`)}</li>
              <li>{t(`Click Auto Sort in the toolbar. (See below for details).`)}</li>
              <li>{t(`Make sure to run the game directly via the Play button in the top left corner ` +
                            `(on the Bannerlord tile). Your Vortex load order may not be loaded if you run the Single Player game through the game launcher.`)}</li>
              <li>{t(`Optional: Manually drag and drop mods to different positions in the load order (for testing different overrides). Mods further down the list override mods further up.`)}</li>
            </ul>
          </p>
        <div>
          <p>
            {t(`Please note:`)}
            <ul>
              <li>
                {t(`The load order reflected here will only be loaded if you run the game through Vortex's default starter for Bannerlord. `
                 + `If you have a different tool set as the primary starter, please unassign it in the tools dashlet on the dashboard. `)}
              </li>
              <li>
                {t(`Auto Sort uses Aragas's Bannerlord Mod Sorter. It will sort your mods based on the dependencies defined by the mods themselves. `)}
              </li>
              <li>
                {t(`If you cannot see your mod in this load order, Vortex may have been unable to find or parse its SubModule.xml file. ` +
                            `Most - but not all mods - come with or need a SubModule.xml file.`)}
              </li>
              <li>
                {t(`Hit the deploy button whenever you install and enable a new mod.`)}
              </li>
              <li>
                {t(`The game will not launch unless the game store (Steam, Epic, etc) is started beforehand. If you're getting the ` +
                            `"Unable to Initialize Steam API" error, restart Steam.`)}
              </li>
            </ul>
          </p>
        </div>
      </>
  );
};
