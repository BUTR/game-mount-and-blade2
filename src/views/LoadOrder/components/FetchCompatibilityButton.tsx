import React, { FC } from "react";
import { ToolbarIcon } from "@nexusmods/vortex-api";
import { useLocalization } from "@bannerlord/core/localization/hooks";

export type FetchCompatibilityButtonProps = {
  refreshAsync: () => Promise<void>;
  // Passed by Vortex's IconBar to custom action components
  buttonType?: "text" | "icon" | "both" | "menu" | undefined;
};

// A custom action component instead of a plain registerAction icon, because only ToolbarIcon lets the tooltip differ
// from the label
export const FetchCompatibilityButton: FC<FetchCompatibilityButtonProps> = (
  props,
) => {
  const { refreshAsync, buttonType } = props;

  const { localize: t } = useLocalization();

  // Same as IconBar's own icons: no buttonType shows both
  const hasIcon = buttonType !== "text";
  const hasText = buttonType !== "icon";

  const hint = t(
    `{=zXWdahH9}Get Update Recommendations{NL}Clicking on this button will send your module list to the BUTR server to get compatibility scores and recommended versions.{NL}They are based on the crash reports from ButterLib.{NL}{NL}(Requires Internet Connection)`,
    {
      NL: "\n",
    },
  );

  return (
    <ToolbarIcon
      className="action-fetch-compatibility"
      {...(hasIcon && { icon: "refresh" })}
      {...(hasText && { text: t(`Fetch Compatibility`) })}
      tooltip={hint}
      placement="top"
      onClick={() => void refreshAsync()}
    />
  );
};
