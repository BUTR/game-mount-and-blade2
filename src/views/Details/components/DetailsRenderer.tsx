import React from "react";
import { types } from "vortex-api";
import { languageMap } from "../../../localization";

export type ExternalBannerProps = {
  mod: types.IMod;
};

export const DetailsRenderer = (
  props: ExternalBannerProps,
): JSX.Element | null => {
  const { mod } = props;

  // Get the language codes array
  const languageCodes: string[] =
    mod?.attributes?.["translationLanguages"] || [];

  // If no languages, return null
  if (languageCodes.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {languageCodes.map((code) => {
        const languageName = languageMap.getNameFromCode(code);

        return (
          <span
            key={code}
            style={{
              padding: "4px 8px",
              backgroundColor: "var(--brand-bg, #f5f5f5)",
              border: "1px solid var(--border-color, #ccc)",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
            title={code}
          >
            {languageName}
          </span>
        );
      })}
    </div>
  );
};
