import { types, util } from 'vortex-api';
import { IBannerlordMod, VortexLoadOrderStorage } from '../types';

const isValidMod = (mod: types.IMod): boolean => {
  return mod !== undefined && mod.type !== 'collection';
};

const isModInCollection = (collectionMod: types.IMod, mod: IBannerlordMod): boolean => {
  if (!collectionMod.rules) {
    return false;
  }

  return collectionMod.rules.find((rule) => util.testModReference(mod, rule.reference)) !== undefined;
};

export const genCollectionGeneralLoadOrder = (
  loadOrder: VortexLoadOrderStorage,
  mods: IBannerlordMod[],
  collectionMod?: types.IMod
): VortexLoadOrderStorage => {
  // We get the current load order the user has
  // And the mods that are tied to the collection
  // And we return the load order with the mods that are in the collection
  const filteredLoadOrder = loadOrder
    .filter((entry) => {
      if (entry.modId === undefined) {
        // We add the non existent LO entries as optionals
        return entry.data ? entry.enabled : false;
      }

      const mod = mods.find((x) => x.attributes?.modId === parseInt(entry.modId ?? '0'));
      if (!mod) {
        return false;
      }

      if (collectionMod) {
        return isValidMod(mod) && isModInCollection(collectionMod, mod);
      }

      return isValidMod(mod);
    })
    .reduce<VortexLoadOrderStorage>((accum, iter) => {
      accum.push(iter);
      return accum;
    }, []);
  return filteredLoadOrder;
};
