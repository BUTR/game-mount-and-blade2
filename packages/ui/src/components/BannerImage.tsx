import React, { FC, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { log, selectors, types } from "@nexusmods/vortex-api";
import {
  BANNER_VIEW_BOX,
  BannerShape,
  getBannerPrimaryColor,
  getShapeTransform,
  renderBannerAsync,
} from "../banner/render";
import { getBannerAssetsAsync } from "../banner/assets";
import { GAME_ID } from "@bannerlord/core/common";

export type BannerImageProps = {
  /**
   * Banner serialization code (e.g. ClanBannerCode from a save game).
   */
  code: string | undefined;
  /**
   * Module IDs in load order (matching save game modules).
   * Banner colors and icons are merged across these modules in this order.
   */
  modules?: readonly string[];
  /**
   * Accessible label for screen readers. If omitted, the banner is marked as decorative (aria-hidden).
   */
  label?: string;
  className?: string;
};

const MODULE_SEPARATOR = ";";

/**
 * Renders a clan banner SVG using the game's extracted meshes and textures,
 * framed to match the in-game small banner portrait.
 * Renders nothing while assets are loading or if the code/files cannot be parsed.
 */
export const BannerImage: FC<BannerImageProps> = ({
  code,
  modules,
  label,
  className,
}) => {
  const gamePath = useSelector(
    (state: types.IState) => selectors.discoveryByGame(state, GAME_ID)?.path,
  );
  // Serialized key to avoid redundant re-renders when a new array reference with identical modules is passed
  const moduleKey = modules?.join(MODULE_SEPARATOR);
  const renderKey = `${moduleKey ?? ""}|${code ?? ""}`;
  // Cache rendered shapes alongside their renderKey so a previous save's banner is not displayed while a new one loads
  const [rendered, setRendered] = useState<{
    key: string;
    shapes: BannerShape[] | null;
  } | null>(null);

  useEffect(() => {
    if (gamePath === undefined || code === undefined || code === "") {
      return;
    }
    let cancelled = false;
    getBannerAssetsAsync(gamePath, moduleKey?.split(MODULE_SEPARATOR))
      .then((assets) => renderBannerAsync(assets, code))
      .then((shapes) => {
        if (!cancelled) {
          setRendered({ key: `${moduleKey ?? ""}|${code}`, shapes });
        }
      })
      .catch((err: unknown) => {
        log("warn", "Failed to draw a banner from the game's files", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [gamePath, code, moduleKey]);

  const shapes =
    rendered !== null && rendered.key === renderKey ? rendered.shapes : null;
  if (shapes === null || shapes.length === 0) {
    return null;
  }

  return (
    <svg
      className={className}
      viewBox={BANNER_VIEW_BOX}
      role={label !== undefined ? "img" : undefined}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      {shapes.map((shape, index) =>
        shape.kind === "background" ? (
          <g
            // Banner layers can share identical visual configurations; array index is used to preserve layer draw order
            // eslint-disable-next-line @eslint-react/no-array-index-key
            key={index}
            transform={getShapeTransform(shape)}
          >
            {shape.paths.map((path) => (
              <path key={path.d} d={path.d} fill={path.color} />
            ))}
          </g>
        ) : (
          <image
            // eslint-disable-next-line @eslint-react/no-array-index-key
            key={index}
            href={shape.href}
            x={-0.5}
            y={-0.5}
            width={1}
            height={1}
            preserveAspectRatio="none"
            transform={getShapeTransform(shape)}
          />
        ),
      )}
    </svg>
  );
};

export type BannerSource = {
  code: string;
  /**
   * Module IDs in load order, as for BannerImage.
   */
  modules: readonly string[];
};

const NO_COLORS: Readonly<Record<string, string>> = {};

/**
 * The primary colors of banners by key, from the game's palette (see getBannerPrimaryColor), as they load.
 * A banner whose code or files can't be read has none. The colors already loaded stay while others load.
 */
export const useBannerColors = (
  banners: Readonly<Record<string, BannerSource>>,
): Readonly<Record<string, string>> => {
  const gamePath = useSelector(
    (state: types.IState) => selectors.discoveryByGame(state, GAME_ID)?.path,
  );
  // Serialized, so a new object with the same banners doesn't load them again
  const bannersKey = JSON.stringify(
    Object.entries(banners).map(([key, banner]) => [
      key,
      banner.code,
      banner.modules.join(MODULE_SEPARATOR),
    ]),
  );
  const [colors, setColors] = useState(NO_COLORS);

  useEffect(() => {
    if (gamePath === undefined) {
      return;
    }
    let cancelled = false;
    const entries = JSON.parse(bannersKey) as [string, string, string][];
    void Promise.all(
      entries.map(async ([key, code, modules]) => {
        try {
          const assets = await getBannerAssetsAsync(
            gamePath,
            // No modules means the default order, as BannerImage has it
            modules !== "" ? modules.split(MODULE_SEPARATOR) : undefined,
          );
          const color = getBannerPrimaryColor(assets, code);
          return color !== null ? [[key, color] as const] : [];
        } catch (err: unknown) {
          log("warn", "Failed to read a banner's color from the game's files", {
            error: err instanceof Error ? err.message : String(err),
          });
          return [];
        }
      }),
    ).then((loaded) => {
      if (!cancelled) {
        setColors(Object.fromEntries(loaded.flat()));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [gamePath, bannersKey]);

  return colors;
};
