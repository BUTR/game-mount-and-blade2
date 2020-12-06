import React from 'react';
import { Panel } from 'react-bootstrap';
import { FlexLayout, util } from "vortex-api";
import { IInfoPanelProps } from 'vortex-api/lib/extensions/mod_load_order/types/types';
import { IExtensionContext } from 'vortex-api/lib/types/api';

import { I18N_NAMESPACE } from './constants';


export function infoComponent(context: IExtensionContext, props: IInfoPanelProps): React.Component {
  const t = context.api.translate;
  const element = React.createElement(Panel, { id: 'loadorderinfo' },
      React.createElement('h2', {}, t('Managing your load order', { ns: I18N_NAMESPACE })),
      React.createElement(FlexLayout.Flex, {},
      React.createElement('div', {},
      React.createElement('p', {}, t('You can adjust the load order for Bannerlord by dragging and dropping mods up or down on this page. '
                                   + 'Please keep in mind that Bannerlord is still in Early Access, which means that there might be significant '
                                   + 'changes to the game as time goes on. Please notify us of any Vortex related issues you encounter with this '
                                   + 'extension so we can fix it. For more information and help see: ', { ns: I18N_NAMESPACE }),
      React.createElement('a', { onClick: () => util.opn('https://wiki.nexusmods.com/index.php/Modding_Bannerlord_with_Vortex') }, t('Modding Bannerlord with Vortex.', { ns: I18N_NAMESPACE }))))),
      React.createElement('div', {},
        React.createElement('p', {}, t('How to use:', { ns: I18N_NAMESPACE })),
        React.createElement('ul', {},
          React.createElement('li', {}, t('Check the box next to the mods you want to be active in the game.', { ns: I18N_NAMESPACE })),
          React.createElement('li', {}, t('Click Auto Sort in the toolbar. (See below for details).', { ns: I18N_NAMESPACE })),
          React.createElement('li', {}, t('Make sure to run the game directly via the Play button in the top left corner '
                                        + '(on the Bannerlord tile). Your Vortex load order may not be loaded if you run the Single Player game through the game launcher.', { ns: I18N_NAMESPACE })),
          React.createElement('li', {}, t('Optional: Manually drag and drop mods to different positions in the load order (for testing different overrides). Mods further down the list override mods further up.', { ns: I18N_NAMESPACE })))),
      React.createElement('div', {},
        React.createElement('p', {}, t('Please note:', { ns: I18N_NAMESPACE })),
        React.createElement('ul', {},
          React.createElement('li', {}, t('The load order reflected here will only be loaded if you run the game via the play button in '
                                        + 'the top left corner. Do not run the Single Player game through the launcher, as that will ignore '
                                        + 'the Vortex load order and go by what is shown in the launcher instead.', { ns: I18N_NAMESPACE })),
          React.createElement('li', {}, t('For Bannerlord, mods sorted further towards the bottom of the list will override mods further up (if they conflict). '
                                        + 'Note: Harmony patches may be the exception to this rule.', { ns: I18N_NAMESPACE })),
          React.createElement('li', {}, t('Auto Sort uses the SubModule.xml files (the entries under <DependedModules>) to detect '
                                        + 'dependencies to sort by. ', { ns: I18N_NAMESPACE })),
          React.createElement('li', {}, t('If you cannot see your mod in this load order, Vortex may have been unable to find or parse its SubModule.xml file. '
                                        + 'Most - but not all mods - come with or need a SubModule.xml file.', { ns: I18N_NAMESPACE })),
          React.createElement('li', {}, t('Hit the deploy button whenever you install and enable a new mod.', { ns: I18N_NAMESPACE })),
          React.createElement('li', {}, t('The game will not launch unless the game store (Steam, Epic, etc) is started beforehand. If you\'re getting the '
                                        + '"Unable to Initialize Steam API" error, restart Steam.', { ns: I18N_NAMESPACE })),
          React.createElement('li', {}, t('Right clicking an entry will open the context menu which can be used to lock LO entries into position; entry will '
                                        + 'be ignored by auto-sort maintaining its locked position.', { ns: I18N_NAMESPACE })))));
    // TODO
    var anyValue: any;
    var component: React.Component;
    anyValue = element;
    component = anyValue;
    return component;
}