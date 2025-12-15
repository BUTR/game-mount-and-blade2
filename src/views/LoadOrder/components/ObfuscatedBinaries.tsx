import React from "react";
import { tooltip } from "vortex-api";
import { useLocalization } from "../../../localization";

export type ObfuscaedBinariesProps = {
  hasObfuscatedBinaries: boolean;
};

export const ObfuscaedBinaries = (
  props: ObfuscaedBinariesProps,
): JSX.Element => {
  const { hasObfuscatedBinaries } = props;

  const { localize: t } = useLocalization();

  if (hasObfuscatedBinaries) {
    return (
      <tooltip.Icon
        className="nexus-id-invalid"
        name="feedback-warning"
        style={{
          width: `1.5em`,
          height: `1.5em`,
          color: `var(--brand-danger)`,
        }}
        tooltip={t(
          `{=aAYdk1zd}The DLL is obfuscated!{NL}There is no guarantee that the code is safe!{NL}The BUTR Team warns of consequences arising from running obfuscated code!`,
          {
            NL: "\n",
          },
        )}
      />
    );
  }

  return <div style={{ width: `1.5em`, height: `1.5em` }} />;
};
