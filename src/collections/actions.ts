import { createAction } from 'redux-act';
import { ICollectionGeneralData, ICollectionSettingsData } from './types';
import { EXTENSION_BASE_ID } from '../common';

export type SetCollectionDataPayload = {
  collectionSlug: string;
  collectionData: ICollectionGeneralData;
};

export type SetCollectionModOptionsPayload = {
  collectionSlug: string;
  collectionData: ICollectionSettingsData;
};

const setCollectionGeneralData = createAction<string, ICollectionGeneralData, SetCollectionDataPayload>(
  `${EXTENSION_BASE_ID}_SET_COLLECTION_GENERAL_DATA`,
  (collectionSlug: string, collectionData: ICollectionGeneralData) => ({
    collectionSlug,
    collectionData,
  })
);

const setCollectionModOptions = createAction<string, ICollectionSettingsData, SetCollectionModOptionsPayload>(
  `${EXTENSION_BASE_ID}_SET_COLLECTION_MOD_OPTIONS`,
  (collectionSlug: string, collectionData: ICollectionSettingsData) => ({
    collectionSlug,
    collectionData,
  })
);

export const actionsCollections = {
  setCollectionGeneralData,
  setCollectionModOptions,
};
