/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import * as React from 'react';
import { Panel } from 'react-bootstrap';
import { util, FlexLayout } from 'vortex-api';
import { useTranslation } from 'react-i18next';
import { I18N_NAMESPACE } from '../common';

const LoadOrderInfo = (): JSX.Element => {
  const [t] = useTranslation(I18N_NAMESPACE);

  const openWiki = (): Bluebird<void> => util.opn(`https://wiki.nexusmods.com/index.php/Modding_Bannerlord_with_Vortex`);

  return (
    <Panel id='loadorderinfo'>
      <h2>{t(`Managing your load order`)}</h2>
      <FlexLayout.Flex>
        <div>
          <p>
            {t(`You can adjust the load order for Bannerlord by dragging and dropping mods up or down on this page. ` +
                        `Please keep in mind that Bannerlord is still in Early Access, which means that there might be significant ` +
                        `changes to the game as time goes on. Please notify us of any Vortex related issues you encounter with this ` +
                        `extension so we can fix it. For more information and help see: `)}
            <a onClick={openWiki}>{t(`Modding Bannerlord with Vortex.`)}</a>
          </p>
        </div>
        <div>
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
        </div>
        <div>
          <p>
            {t(`Please note:`)}
            <ul>
              <li>
                {t(`The load order reflected here will only be loaded if you run the game via the play button in ` +
                            `the top left corner. Do not run the Single Player game through the launcher, as that will ignore ` +
                            `the Vortex load order and go by what is shown in the launcher instead.`)}
              </li>
              <li>
                {t(`For Bannerlord, mods sorted further towards the bottom of the list will override mods further up (if they conflict). ` +
                            `Note: Harmony patches may be the exception to this rule.`)}
              </li>
              <li>
                {t(`Auto Sort uses the SubModule.xml files (the entries under <DependedModules>) to detect ` +
                            `dependencies to sort by. `)}
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
      </FlexLayout.Flex>
    </Panel>
  );
};

export default LoadOrderInfo;
