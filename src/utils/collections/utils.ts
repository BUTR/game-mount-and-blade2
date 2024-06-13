import { IHasExtensionContextCollectionFeature } from '.';

export const hasCollection = (hasCollection: object): hasCollection is IHasExtensionContextCollectionFeature => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (hasCollection as any).registerCollectionFeature;
};
