import React from 'react';
import { Button, ListGroup, ListGroupItem } from 'react-bootstrap';
import { useSelector } from 'react-redux';
import { EmptyPlaceholder, FlexLayout, Icon, MainContext, selectors, tooltip, types } from 'vortex-api';
import { useContext, useEffect, useState } from 'react';
import {
  IModuleCompatibilityInfoCache,
  IPersistenceLoadOrderEntry,
  IVortexViewModelData,
  VortexLoadOrderStorage,
} from '../../types';
import {
  genCollectionsData,
  hasPersistentBannerlordMods,
  hasPersistentLoadOrder,
  IBannerlordCollectionsData,
  ICollectionFeatureProps,
  IModAnalyzerRequestModule,
  IModAnalyzerRequestQuery,
  ModAnalyzerProxy,
  useLauncher,
  useLocalization,
  versionToString,
  VortexLauncherManager,
} from '../../utils';
import { CompatibilityInfo as CompatibilityInfo, ModuleIcon } from '../Controls';

interface IProps extends ICollectionFeatureProps {}

export type BannerlordDataViewProps = ICollectionFeatureProps;

export const BannerlordDataView = (props: IProps) => {
  const [compatibilityInfoCache, setCompatibilityInfoCache] = useState<IModuleCompatibilityInfoCache>({});
  const [collectionData, setCollectionData] = useState<IBannerlordCollectionsData>({ hasBLSE: false, loadOrder: [] });

  const { loadOrder, mods } = useSelector(mapState);
  const launcherManager = useLauncher();

  const context = useContext(MainContext);

  useEffect(() => {
    const data = genCollectionsData(context.api, Object.keys(mods));
    setCollectionData(data);
  }, [context.api, mods]);

  const { localize: t } = useLocalization();

  const { hasBLSE, loadOrder: persistentLoadOrder } = collectionData;

  const refreshCompatibilityScores = () => {
    getCompatibilityScores(context.api, launcherManager).then((cache) => {
      setCompatibilityInfoCache(cache);
    });
  };

  const hint = t(
    `{=zXWdahH9}Get Update Recommendations{NL}Clicking on this button will send your module list to the BUTR server to get compatibility scores and recommended versions.{NL}They are based on the crash reports from ButterLib.{NL}{NL}(Requires Internet Connection)`,
    {
      NL: '\n',
    }
  );

  return persistentLoadOrder && Object.values(persistentLoadOrder).length !== 0 ? (
    <div style={{ overflow: 'auto' }}>
      <h4>{t('Configuration')}</h4>
      <ConfigurationInfo hasBLSE={hasBLSE} />
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
        {Object.values(persistentLoadOrder).map((x) => {
          EntryView(x, loadOrder, compatibilityInfoCache);
        })}
      </ListGroup>
    </div>
  ) : (
    <Placeholder />
  );
};

const mapState = (state: types.IState) => {
  const profile = selectors.activeProfile(state);
  const loadOrder = hasPersistentLoadOrder(state.persistent) ? state.persistent.loadOrder[profile?.id] ?? [] : [];
  const mods = hasPersistentBannerlordMods(state.persistent) ? state.persistent.mods.mountandblade2bannerlord : {};
  return {
    loadOrder,
    mods,
  };
};

const getCompatibilityScores = async (api: types.IExtensionApi, launcherManager: VortexLauncherManager) => {
  const proxy = new ModAnalyzerProxy(api);
  const allModules = launcherManager.getAllModules();
  const gameVersion = launcherManager.getGameVersionVortex();
  const query: IModAnalyzerRequestQuery = {
    gameVersion: gameVersion,
    modules: Object.values(allModules).map<IModAnalyzerRequestModule>((x) => ({
      moduleId: x.id,
      moduleVersion: versionToString(x.version),
    })),
  };
  const result = await proxy.analyze(query);
  return result.modules.reduce<IModuleCompatibilityInfoCache>((map, curr) => {
    map[curr.moduleId] = {
      score: curr.compatibility,
      recommendedScore: curr.recommendedCompatibility,
      recommendedVersion: curr.recommendedModuleVersion,
    };
    return map;
  }, {});
};

const isOptional = (item: types.IFBLOLoadOrderEntry<IVortexViewModelData>): boolean => {
  return !item.modId && item.data?.moduleInfoExtended.isOfficial === false ? true : false;
};

const openLoadOrderPage = (api: types.IExtensionApi) => {
  api.events.emit('show-main-page', 'file-based-loadorder');
};

const EntryView = (
  entry: IPersistenceLoadOrderEntry | undefined,
  loadOrder: VortexLoadOrderStorage,
  compatibilityInfoCache: IModuleCompatibilityInfoCache
) => {
  if (!entry) {
    return null;
  }

  const loEntry = loadOrder.find((x) => x.id === entry.id);
  if (!loEntry || !loEntry.data) {
    return null;
  }

  const compatibilityInfo = compatibilityInfoCache[loEntry.id];

  const key = loEntry.id;
  const name = entry.name ? `${entry.name}` : `${entry.id}`;
  const version = versionToString(loEntry.data.moduleInfoExtended.version);
  let classes = ['load-order-entry', 'collection-tab'];
  if (isOptional(loEntry)) {
    classes = classes.concat('external');
  }

  return (
    <ListGroupItem key={key} className={classes.join(' ')}>
      <p className="load-order-index">{entry.index + 1}</p>
      <ModuleIcon data={loEntry.data} />
      <p className="load-order-name">
        {name} ({version})
      </p>
      <OptionalBanner item={loEntry} />
      <CompatibilityInfo data={loEntry.data} compatibilityInfo={compatibilityInfo} />
      <div style={{ width: `1.5em`, height: `1.5em` }} />
    </ListGroupItem>
  );
};

const OptionalBanner = (props: { item: types.IFBLOLoadOrderEntry<IVortexViewModelData> }) => {
  const { item } = props;

  const { localize: t } = useLocalization();

  return isOptional(item) ? (
    <div className="load-order-unmanaged-banner">
      <Icon className="external-caution-logo" name="feedback-warning" />
      <span className="external-text-area">{t('Not in the collection. Optional')}</span>
    </div>
  ) : null;
};

const ConfigurationInfo = (props: { hasBLSE: boolean }) => {
  const { hasBLSE } = props;

  const { localize: t } = useLocalization();

  return (
    <ListGroup id="collections-load-order-list">
      <span>{t('Require BLSE to be installed')}</span>
      <span>{': '}</span>
      {hasBLSE ? <span>{t('Yes')}</span> : <span>{t('No')}</span>}
    </ListGroup>
  );
};

const OpenLoadOrderButton = () => {
  const { localize: t } = useLocalization();

  const context = useContext(MainContext);

  return (
    <Button
      id="btn-more-mods"
      className="collection-add-mods-btn"
      onClick={() => openLoadOrderPage(context.api)}
      bsStyle="ghost"
    >
      {t('Open Load Order Page')}
    </Button>
  );
};

const LoadOrderEditInfo = () => {
  const { localize: t } = useLocalization();

  const context = useContext(MainContext);

  return (
    <FlexLayout type="row" id="collection-edit-loadorder-edit-info-container">
      <FlexLayout.Fixed className="loadorder-edit-info-icon">
        <Icon name="dialog-info" />
      </FlexLayout.Fixed>
      <FlexLayout.Fixed className="collection-edit-loadorder-edit-info">
        {t('You can make changes to this data from the ')}
        <a className="fake-link" onClick={() => openLoadOrderPage(context.api)} title={t('Go to Load Order Page')}>
          {t('Load Order page.')}
        </a>
        {t(
          ' If you believe a load order entry is missing, please ensure the ' +
            'relevant mod is enabled and has been added to the collection.'
        )}
      </FlexLayout.Fixed>
    </FlexLayout>
  );
};

const Placeholder = () => {
  const { localize: t } = useLocalization();

  return (
    <EmptyPlaceholder
      icon="sort-none"
      text={t('You have no load order entries (for the current mods in the collection)')}
      subtext={OpenLoadOrderButton()}
    />
  );
};
