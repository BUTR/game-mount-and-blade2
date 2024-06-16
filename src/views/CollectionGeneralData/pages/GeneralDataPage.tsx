import React, { useContext, useEffect, useState } from 'react';
import { ListGroup } from 'react-bootstrap';
import { useSelector } from 'react-redux';
import { MainContext, selectors, tooltip, types } from 'vortex-api';
import { LoadOrderEditInfo, LoadOrderEntry, Placeholder, Requirements } from '../components';
import { IBannerlordModStorage, PersistenceLoadOrderStorage, VortexLoadOrderStorage } from '../../../types';
import {
  genCollectionGeneralData,
  getCompatibilityScores,
  hasPersistentBannerlordMods,
  hasPersistentLoadOrder,
  IModuleCompatibilityInfoCache,
  useLocalization,
} from '../../../utils';
import { ICollectionFeatureProps } from '../../types';

interface IFromState {
  loadOrder: VortexLoadOrderStorage;
  mods: IBannerlordModStorage;
}

export type BannerlordGeneralDataPageProps = ICollectionFeatureProps;

export const BannerlordGeneralDataPage = (props: BannerlordGeneralDataPageProps): JSX.Element => {
  const [compatibilityInfoCache, setCompatibilityInfoCache] = useState<IModuleCompatibilityInfoCache>({});
  const [hasBLSE, setHasBLSE] = useState<boolean>(false);
  const [persistentLoadOrder, setPersistentLoadOrder] = useState<PersistenceLoadOrderStorage>([]);

  const { loadOrder, mods } = useSelector(mapState);

  const context = useContext(MainContext);

  useEffect(() => {
    const data = genCollectionGeneralData(context.api, Object.keys(mods));
    setHasBLSE(data.hasBLSE);
    setPersistentLoadOrder(data.suggestedLoadOrder);
  }, [context.api, mods]);

  const { localize: t } = useLocalization();

  const refreshCompatibilityScores = (): void => {
    getCompatibilityScores(context.api)
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
        {Object.values(persistentLoadOrder).map((entry) => (
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
  const loadOrder = hasPersistentLoadOrder(state.persistent) ? state.persistent.loadOrder[profile?.id] ?? [] : [];
  const mods = hasPersistentBannerlordMods(state.persistent) ? state.persistent.mods.mountandblade2bannerlord : {};
  return {
    loadOrder,
    mods,
  };
};
