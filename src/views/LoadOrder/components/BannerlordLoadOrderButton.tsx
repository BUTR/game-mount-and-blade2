import React, { FC } from "react";
import { DropdownButton, MenuItem } from "react-bootstrap";
import { Icon } from "@nexusmods/vortex-api";
import { useLocalization } from "@bannerlord/core/localization/hooks";

export type BannerlordLoadOrderButtonProps = {
  importNovusAsync: () => Promise<unknown>;
  importLauncherExAsync: () => Promise<unknown>;
  exportLauncherExAsync: () => Promise<unknown>;
  // Passed by Vortex's IconBar to custom action components
  buttonType?: "text" | "icon" | "both" | "menu" | undefined;
};

// A custom action component because IconBar's own dropdowns are titled by the common prefix of their entries.
// Mirrors Vortex's ToolbarDropdown markup so it looks like the Load Order dropdown next to it
export const BannerlordLoadOrderButton: FC<BannerlordLoadOrderButtonProps> = (
  props,
) => {
  const {
    importNovusAsync,
    importLauncherExAsync,
    exportLauncherExAsync,
    buttonType,
  } = props;

  const { localize: t } = useLocalization();

  // Same as IconBar's own icons: no buttonType shows both
  const hasIcon = buttonType !== "text";
  const hasText = buttonType !== "icon";

  const title = (
    <div>
      {hasIcon ? <Icon name="import" /> : null}
      {hasText ? (
        <div className="button-text">{t(`Bannerlord LO`)}...</div>
      ) : null}
    </div>
  );

  return (
    <DropdownButton
      id="btn-bannerlord-load-order"
      className="toolbar-dropdown"
      title={title}
    >
      <MenuItem onSelect={() => void importNovusAsync()}>
        {t(`Import from Novus`)}
      </MenuItem>
      <MenuItem onSelect={() => void importLauncherExAsync()}>
        {t(`Import from LauncherEx`)}
      </MenuItem>
      <MenuItem onSelect={() => void exportLauncherExAsync()}>
        {t(`Export to LauncherEx`)}
      </MenuItem>
    </DropdownButton>
  );
};
