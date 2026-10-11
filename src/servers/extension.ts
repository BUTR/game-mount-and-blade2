import { getFromServerAsync, isRecord, parseJsonBody } from "./http";
import { IServerEntry } from "./types";
import { sanitizeServerText } from "./utils";

/**
 * Endpoint exposed by the BUTR server extension on the dedicated server's HTTP host alongside `/maps/list`.
 * The schema specification is documented in `docs/server-extension.md`.
 */
export const SERVER_EXTENSION_PATH = "/butr/v1/server";
export const SERVER_EXTENSION_SCHEMA_VERSION = 1;

const MAX_MODULES = 256;
const MAX_LINKS = 10;
const MAX_TEXT_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 4000;
const VERSION_PATTERN = /^([abdev])(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/;
// Matches control characters except line feeds (\n), preserving line breaks in multiline text.
const CONTROL_CHARACTERS_EXCEPT_LINE_FEED =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0009\u000b-\u001f\u007f]/g;

export interface INexusModsReference {
  modId: number;
  fileId: number | null;
}

export interface IServerExtensionLink {
  label: string;
  url: string;
}

export interface IServerExtensionModule {
  id: string;
  name: string | null;
  /**
   * Normalized to the four-part version format used by the game and lobby (e.g., 'v1.2.3.0').
   */
  version: string | null;
}

export interface IServerExtensionClientModule extends IServerExtensionModule {
  required: boolean;
  nexusMods: INexusModsReference | null;
  url: string | null;
}

/**
 * Nexus Mods collection associated with the server that players can install to join.
 */
export interface IServerExtensionCollection {
  slug: string;
  /**
   * Collection revision number, or `null` to use the latest published revision.
   */
  revision: number | null;
  required: boolean;
}

export interface IServerExtensionInfo {
  schemaVersion: number;
  description: string | null;
  links: IServerExtensionLink[];
  serverModules: IServerExtensionModule[];
  clientModules: IServerExtensionClientModule[];
  collection: IServerExtensionCollection | null;
}

export type ServerExtensionState =
  | "pending"
  | "available"
  | "absent"
  | "unreachable"
  | "invalid";

export interface IServerExtensionResult {
  state: ServerExtensionState;
  info: IServerExtensionInfo | null;
  error: string | null;
  checkedAt: number | null;
}

export const createPendingExtensionResult = (): IServerExtensionResult => ({
  state: "pending",
  info: null,
  error: null,
  checkedAt: null,
});

const toText = (
  value: unknown,
  maxLength: number,
  multiline = false,
): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const text = multiline
    ? value
        .replace(/\r\n?/g, "\n")
        .replace(CONTROL_CHARACTERS_EXCEPT_LINE_FEED, "")
        .trim()
    : sanitizeServerText(value);
  return text.length > 0 ? text.slice(0, maxLength) : null;
};

/**
 * Normalizes a module version string to the four-part format including changeset (e.g., "v1.2.3" -> "v1.2.3.0"),
 * matching how the game client compares version strings.
 */
export const normalizeModuleVersion = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, type, major, minor, revision, changeSet] = match;
  return `${type}${Number(major)}.${Number(minor)}.${Number(revision)}.${Number(changeSet ?? 0)}`;
};

const toPositiveInteger = (value: unknown): number | null =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value < 100_000_000
    ? value
    : null;

/**
 * Validates and sanitizes HTTP/HTTPS URLs. Any non-HTTP(S) URI schemes are rejected.
 */
export const toSafeUrl = (value: unknown): string | null => {
  const text = toText(value, 2048);
  if (text === null) {
    return null;
  }
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const parseNexusMods = (value: unknown): INexusModsReference | null => {
  if (!isRecord(value)) {
    return null;
  }
  const modId = toPositiveInteger(value["modId"]);
  return modId !== null
    ? { modId, fileId: toPositiveInteger(value["fileId"]) }
    : null;
};

const parseModule = (value: unknown): IServerExtensionModule | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id = toText(value["id"], MAX_TEXT_LENGTH);
  if (id === null) {
    return null;
  }
  return {
    id,
    name: toText(value["name"], MAX_TEXT_LENGTH),
    version: normalizeModuleVersion(value["version"]),
  };
};

const parseClientModule = (
  value: unknown,
): IServerExtensionClientModule | null => {
  const module = parseModule(value);
  if (module === null || !isRecord(value)) {
    return null;
  }
  return {
    ...module,
    // Listed client modules default to required unless explicitly designated otherwise by the server.
    required: value["required"] !== false,
    nexusMods: parseNexusMods(value["nexusMods"]),
    url: toSafeUrl(value["url"]),
  };
};

const parseList = <T>(
  value: unknown,
  parse: (item: unknown) => T | null,
  limit: number,
): T[] =>
  Array.isArray(value)
    ? value
        .slice(0, limit)
        .map(parse)
        .filter((item): item is T => item !== null)
    : [];

// Nexus Mods collection slugs consist of 4 to 32 lowercase alphanumeric characters.
const COLLECTION_SLUG_PATTERN = /^[a-z0-9]{4,32}$/;

const parseCollection = (value: unknown): IServerExtensionCollection | null => {
  if (!isRecord(value) || typeof value["slug"] !== "string") {
    return null;
  }
  const slug = value["slug"].trim().toLowerCase();
  if (!COLLECTION_SLUG_PATTERN.test(slug)) {
    return null;
  }
  return {
    slug,
    revision: toPositiveInteger(value["revision"]),
    required: value["required"] !== false,
  };
};

const parseLink = (value: unknown): IServerExtensionLink | null => {
  if (!isRecord(value)) {
    return null;
  }
  const url = toSafeUrl(value["url"]);
  if (url === null) {
    return null;
  }
  return { label: toText(value["label"], MAX_TEXT_LENGTH) ?? url, url };
};

/**
 * Parses the BUTR server extension JSON payload.
 * Future schema versions maintain backward compatibility by only adding fields;
 * unknown fields are safely ignored.
 */
export const parseServerExtensionInfo = (
  text: string,
): IServerExtensionInfo => {
  const parsed = parseJsonBody(text);
  if (!isRecord(parsed) || typeof parsed["schemaVersion"] !== "number") {
    throw new Error("The response is not BUTR server information");
  }

  const dedupe = <T extends { id: string }>(modules: T[]): T[] => {
    const seen = new Set<string>();
    return modules.filter((module) => {
      if (seen.has(module.id)) {
        return false;
      }
      seen.add(module.id);
      return true;
    });
  };

  return {
    schemaVersion: parsed["schemaVersion"],
    description: toText(parsed["description"], MAX_DESCRIPTION_LENGTH, true),
    links: parseList(parsed["links"], parseLink, MAX_LINKS),
    serverModules: dedupe(
      parseList(parsed["serverModules"], parseModule, MAX_MODULES),
    ),
    clientModules: dedupe(
      parseList(parsed["clientModules"], parseClientModule, MAX_MODULES),
    ),
    // Current server implementations nest the collection under `nexusMods`; legacy builds placed it at root.
    collection: parseCollection(
      (isRecord(parsed["nexusMods"])
        ? parsed["nexusMods"]["collection"]
        : undefined) ?? parsed["collection"],
    ),
  };
};

/**
 * Determines whether an HTTP status code indicates that the BUTR server extension is not installed.
 * Vanilla dedicated servers respond with 404, or return authentication redirects / 401 / 403
 * if the built-in web management interface intercepts the request.
 */
const isNotInstalledStatus = (statusCode: number): boolean =>
  statusCode === 404 ||
  statusCode === 401 ||
  statusCode === 403 ||
  (statusCode >= 300 && statusCode < 400);

/**
 * Queries metadata from the BUTR server extension endpoint.
 * An absent endpoint is expected on unmodded / vanilla dedicated servers. Never rejects.
 */
export const queryServerExtensionAsync = async (
  server: Pick<IServerEntry, "address" | "port">,
): Promise<IServerExtensionResult> => {
  const response = await getFromServerAsync(server, SERVER_EXTENSION_PATH);
  const checkedAt = Date.now();

  switch (response.kind) {
    case "failed":
      return {
        state: response.responseTimeMs === null ? "unreachable" : "invalid",
        info: null,
        error: response.error,
        checkedAt,
      };
    case "status":
      return isNotInstalledStatus(response.statusCode)
        ? { state: "absent", info: null, error: null, checkedAt }
        : {
            state: "invalid",
            info: null,
            error: `The server responded with HTTP ${response.statusCode}`,
            checkedAt,
          };
    case "ok":
      try {
        return {
          state: "available",
          info: parseServerExtensionInfo(response.body),
          error: null,
          checkedAt,
        };
      } catch (err) {
        return {
          state: "invalid",
          info: null,
          error: err instanceof Error ? err.message : String(err),
          checkedAt,
        };
      }
  }
};
