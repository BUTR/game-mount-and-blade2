import React, { FC } from "react";

// The Modern UI's pictograms (Vortex's assets/pictograms) are a glyph floating over an isometric platform in the
// primary color. Vortex only has pictograms for its own pages, so these are drawn the same way: its platform and
// shadows, with a glyph of the extension's own in the same 200x200 grid
const PLATFORM_PATH =
  "M20.7741 117.827C19.4616 116.963 19.4616 115.037 20.7741 114.173L98.797 62.7922C99.527 62.3115 100.473 62.3115 " +
  "101.203 62.7922L179.226 114.173C180.538 115.037 180.538 116.963 179.226 117.827L101.203 169.208C100.473 " +
  "169.688 99.527 169.688 98.797 169.208L20.7741 117.827Z";

// Glyphs fill the 88x88 box at (56, 36) and cut their details out with the even-odd rule
const GLYPHS = {
  // Two stacked server units with two lights and a drive slot each, like the Servers navigation icon
  servers:
    "M63 36H137A7 7 0 0 1 144 43V67A7 7 0 0 1 137 74H63A7 7 0 0 1 56 67V43A7 7 0 0 1 63 36Z" +
    "M66.5 55A5.5 5.5 0 1 0 77.5 55A5.5 5.5 0 1 0 66.5 55Z" +
    "M82.5 55A5.5 5.5 0 1 0 93.5 55A5.5 5.5 0 1 0 82.5 55Z" +
    "M107 52H129A3 3 0 0 1 129 58H107A3 3 0 0 1 107 52Z" +
    "M63 86H137A7 7 0 0 1 144 93V117A7 7 0 0 1 137 124H63A7 7 0 0 1 56 117V93A7 7 0 0 1 63 86Z" +
    "M66.5 105A5.5 5.5 0 1 0 77.5 105A5.5 5.5 0 1 0 66.5 105Z" +
    "M82.5 105A5.5 5.5 0 1 0 93.5 105A5.5 5.5 0 1 0 82.5 105Z" +
    "M107 102H129A3 3 0 0 1 129 108H107A3 3 0 0 1 107 102Z",
  // A save disk with its shutter and hub, the shape of the usual save icon
  saves:
    "M64 36H124L144 56V116A8 8 0 0 1 136 124H64A8 8 0 0 1 56 116V44A8 8 0 0 1 64 36Z" +
    "M70 46H112A3 3 0 0 1 115 49V62A3 3 0 0 1 112 65H70A3 3 0 0 1 67 62V49A3 3 0 0 1 70 46Z" +
    "M85 100A15 15 0 1 0 115 100A15 15 0 1 0 85 100Z",
} as const;

export type PictogramName = keyof typeof GLYPHS;

/**
 * The illustration beside a page's title in the Modern UI look, see modern.scss.
 */
export const Pictogram: FC<{ name: PictogramName }> = ({ name }) => {
  // Each page has its own pictogram, so the name keeps the ids unique in the document
  const id = `bls-pictogram-${name}`;
  return (
    <svg
      className="bls-pictogram"
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <g filter={`url(#${id}-platform-shadow)`}>
        <path d={PLATFORM_PATH} fill="currentColor" />
      </g>
      <g filter={`url(#${id}-glyph-shadow)`}>
        <path
          d={GLYPHS[name]}
          fill={`url(#${id}-glyph-fill)`}
          fillRule="evenodd"
        />
      </g>
      <defs>
        <filter
          id={`${id}-platform-shadow`}
          x="19.7897"
          y="62.4317"
          width="169.185"
          height="115.617"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="5.53991" dy="5.25581" />
          <feGaussianBlur stdDeviation="1.61226" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0"
          />
          <feBlend mode="normal" in2="BackgroundImageFix" result="shadow" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="shadow"
            result="shape"
          />
        </filter>
        <filter
          id={`${id}-glyph-shadow`}
          x="50"
          y="30"
          width="112"
          height="120"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="6" dy="12" />
          <feGaussianBlur stdDeviation="4" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0"
          />
          <feBlend mode="normal" in2="BackgroundImageFix" result="shadow" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="shadow"
            result="shape"
          />
        </filter>
        <radialGradient
          id={`${id}-glyph-fill`}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(73.2907 59.3621) rotate(45) scale(121.335 99.6373)"
        >
          <stop offset="0.221154" stopColor="white" />
          <stop offset="0.764423" stopColor="#7D88ED" />
          <stop offset="1" stopColor="white" />
        </radialGradient>
      </defs>
    </svg>
  );
};
