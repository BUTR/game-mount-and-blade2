import React, { useContext, useEffect, useState } from 'react';
import { ListGroup } from 'react-bootstrap';
import { useSelector } from 'react-redux';
import { MainContext, selectors, tooltip, types } from 'vortex-api';
import { LoadOrderEditInfo, LoadOrderEntry, Placeholder, Requirements } from '../components';
import { IBannerlordModStorage, PersistenceLoadOrderStorage, VortexLoadOrderStorage } from '../../../types';
import { ICollectionFeatureProps } from '../../types';
import { getCompatibilityScoresAsync, IModuleCompatibilityInfoCache } from '../../../butr';
import { genCollectionGeneralDataAsync } from '../../../collections';
import { useLocalization } from '../../../localization';
import { getPersistentBannerlordMods, getPersistentLoadOrder } from '../../../vortex';

interface IFromState {
  profile: types.IProfile | undefined;
  loadOrder: VortexLoadOrderStorage;
  mods: IBannerlordModStorage;
}

export type BannerlordGeneralDataPageProps = ICollectionFeatureProps;

export const BannerlordGeneralDataPage = (props: BannerlordGeneralDataPageProps): JSX.Element => {
  const [compatibilityInfoCache, setCompatibilityInfoCache] = useState<IModuleCompatibilityInfoCache>({});
  const [hasBLSE, setHasBLSE] = useState<boolean>(false);
  const [persistentLoadOrder, setPersistentLoadOrder] = useState<PersistenceLoadOrderStorage>([]);

  const { profile, loadOrder, mods } = useSelector(mapState);

  const context = useContext(MainContext);

  useEffect(() => {
    const setDataAsync = async (): Promise<void> => {
      if (!profile) return;
      const data = await genCollectionGeneralDataAsync(profile, loadOrder, mods);
      setHasBLSE(data.hasBLSE);
      setPersistentLoadOrder(data.suggestedLoadOrder);
    };
    void setDataAsync();
  }, [profile, loadOrder, mods]);

  const { localize: t } = useLocalization();

  const refreshCompatibilityScores = (): void => {
    getCompatibilityScoresAsync(context.api)
      .then((cache) => {
        setCompatibilityInfoCache(cache);
      })
      .catch(() => {});
  };

  const hint = t(
    `{=zXWdahH9}Get Update Recommendations{NL}Clicking on this button will send your module list to the BUTR server to get compatibility scores and recommended versions.{NL}They are based on the crash reports from ButterLib.{NL}{NL}(Requires Internet Connection)`,
    {
      NL: '\n',
    }
  );

  return Object.values(persistentLoadOrder).length ? (
    <div style={{ overflow: 'auto' }}>
      <Requirements hasBLSE={hasBLSE} />
      <h4>{t('Load Order')}</h4>
      <tooltip.Button tooltip={hint} onClick={refreshCompatibilityScores}>
        {t('Update Compatibility Score')}
      </tooltip.Button>
      <p>{t('This is a snapshot of the load order information that will be exported with this collection.')}</p>
      <p>
        {t(
          `Enabled modules in the Load Order which are not part of the Collection will be marked as optional in the` +
            `Collection load order and will not be mandatory for the user to have.
            Official modules will be optional too, but the mods in your collection will require them to be installed, ` +
            `which means that it's not possible for a user to install a collection without the official modules.`
        )}
      </p>
      <LoadOrderEditInfo />
      <ListGroup id="collections-load-order-list">
        {Object.values(persistentLoadOrder).map<React.JSX.Element>((entry) => (
          <LoadOrderEntry
            key={entry.id}
            entry={entry}
            loadOrder={loadOrder}
            compatibilityInfoCache={compatibilityInfoCache}
          />
        ))}
      </ListGroup>
    </div>
  ) : (
    <Placeholder />
  );
};

const mapState = (state: types.IState): IFromState => {
  const profile: types.IProfile | undefined = selectors.activeProfile(state);
  const loadOrder = getPersistentLoadOrder(state.persistent, profile?.id);
  const mods = getPersistentBannerlordMods(state.persistent);
  return {
    profile,
    loadOrder,
    mods,
  };
};
