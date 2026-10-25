import type { IRevision } from "@nexusmods/nexus-api";
import { selectors, types, util } from "@nexusmods/vortex-api";
import { IServerExtensionCollection } from "./extension";
import { GAME_ID } from "@bannerlord/core/common";

/**
 * A collection revision as Nexus Mods describes it. Everything shown to the user comes from here,
 * the server only names the slug and revision
 */
export interface ICollectionRevisionInfo {
  collectionId: number;
  revisionId: number;
  revisionNumber: number;
  slug: string;
  name: string;
  author: string | null;
  gameDomain: string | null;
  modCount: number | null;
  latest: boolean;
}

export type CollectionLookupState =
  | "pending"
  | "found"
  | "not-found"
  | "failed";

export interface ICollectionLookup {
  state: CollectionLookupState;
  revision: ICollectionRevisionInfo | null;
  error: string | null;
}

export interface IInstalledCollection {
  modId: string;
  revisionNumber: number | null;
  enabled: boolean;
}

type GetCollectionRevision = (
  collectionSlug: string,
  revisionNumber: number,
) => PromiseLike<IRevision | undefined>;

export const getCollectionLookupKey = (
  collection: IServerExtensionCollection,
): string => `${collection.slug}:${collection.revision ?? "latest"}`;

export const getCollectionPageUrl = (slug: string): string =>
  `https://www.nexusmods.com/games/${GAME_ID}/collections/${slug}`;

const toRevisionInfo = (
  revision: IRevision,
  slug: string,
): ICollectionRevisionInfo => ({
  collectionId: revision.collectionId ?? revision.collection?.id,
  revisionId: revision.id,
  revisionNumber: revision.revisionNumber,
  slug: revision.collection?.slug ?? slug,
  name: revision.collection?.name ?? slug,
  author: revision.collection?.user?.name ?? null,
  gameDomain: revision.collection?.game?.domainName ?? null,
  modCount: revision.modCount ?? revision.modFiles?.length ?? null,
  latest: revision.latest ?? false,
});

/**
 * Asks Nexus Mods through Vortex's own integration, a revision of 0 means the latest published one
 */
export const lookupCollectionAsync = async (
  api: types.IExtensionApi,
  collection: IServerExtensionCollection,
): Promise<ICollectionLookup> => {
  const getRevision = api.ext?.["nexusGetCollectionRevision"] as
    | GetCollectionRevision
    | undefined;
  if (getRevision === undefined) {
    return {
      state: "failed",
      revision: null,
      error: "The Nexus Mods integration is not available",
    };
  }

  try {
    const revision = await getRevision(
      collection.slug,
      collection.revision ?? 0,
    );
    return revision
      ? {
          state: "found",
          revision: toRevisionInfo(revision, collection.slug),
          error: null,
        }
      : // Vortex returns null for network errors and rate limits as well (after displaying its own notification)
        { state: "not-found", revision: null, error: null };
  } catch (err) {
    return {
      state: "failed",
      revision: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/**
 * Checks whether Vortex is currently installing a collection (Vortex installs collections one at a time).
 * Returns false on older Vortex versions that lack this selector.
 */
export const isCollectionInstalling = (state: types.IState): boolean => {
  const { hasCollectionActiveSession } = selectors as {
    hasCollectionActiveSession?: (state: types.IState) => boolean;
  };
  return hasCollectionActiveSession?.(state) ?? false;
};

/**
 * Finds an installed collection mod matching the given slug (mods of type "collection" store slug and revision attributes).
 */
export const findInstalledCollection = (
  mods: Record<string, types.IMod> | undefined,
  profile: types.IProfile | undefined,
  slug: string,
): IInstalledCollection | null => {
  const installed = Object.values(mods ?? {})
    .filter(
      (mod) =>
        mod.type === "collection" &&
        mod.state === "installed" &&
        mod.attributes?.["collectionSlug"] === slug,
    )
    .map((mod) => {
      // Some installation pathways persist revisionNumber as a string
      const revisionNumber = Number(mod.attributes?.["revisionNumber"] ?? NaN);
      return {
        modId: mod.id,
        revisionNumber: Number.isFinite(revisionNumber) ? revisionNumber : null,
        enabled: profile?.modState?.[mod.id]?.enabled ?? false,
      };
    })
    .sort((lhs, rhs) => (rhs.revisionNumber ?? 0) - (lhs.revisionNumber ?? 0));
  return installed[0] ?? null;
};

/**
 * The same request Vortex's collections extension makes for "Install": the nxm collection link with its Nexus ids,
 * installed into the active profile once downloaded
 */
export const installCollectionAsync = (
  api: types.IExtensionApi,
  revision: ICollectionRevisionInfo,
): Promise<void> =>
  new Promise((resolve, reject) => {
    api.events.emit(
      "start-download",
      [
        `nxm://${GAME_ID}/collections/${revision.slug}/revisions/${revision.revisionNumber}`,
      ],
      {
        game: GAME_ID,
        source: "nexus",
        name: revision.name,
        nexus: {
          ids: {
            gameId: GAME_ID,
            collectionId: revision.collectionId,
            revisionId: revision.revisionId,
            collectionSlug: revision.slug,
            revisionNumber: revision.revisionNumber,
          },
        },
      },
      undefined,
      (err: Error | null) => {
        if (err !== null && !(err instanceof util.UserCanceled)) {
          reject(err);
        } else {
          resolve();
        }
      },
      undefined,
      { allowInstall: "force" },
    );
  });
