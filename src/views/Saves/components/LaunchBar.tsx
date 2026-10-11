import React, { FC, useContext, useState } from "react";
import { Icon, MainContext } from "@nexusmods/vortex-api";
import { ActionButton } from "../../Shared/components/Controls";
import { ISaveGame } from "../types";
import { useLocalization } from "../../../localization/hooks";
import { DeployModStatus } from "../../../blse/modDeploy";
import { getBLSEDeployStatus, setUpBLSEAsync } from "../../../blse/deploy";

export type LaunchBarProps = {
  /**
   * Target save game selected to launch directly into; null to launch into the main menu.
   */
  launchSave: ISaveGame | null;
  hasBLSE: boolean;
  onLaunchSave: (save: ISaveGame | null) => Promise<void>;
};

/**
 * Status and action banner displayed above the saves list, indicating current launch configuration.
 */
export const LaunchBar: FC<LaunchBarProps> = (props) => {
  const { launchSave, hasBLSE, onLaunchSave } = props;

  const { api } = useContext(MainContext);
  const { localize: t } = useLocalization();
  const [settingUp, setSettingUp] = useState(false);

  if (!hasBLSE) {
    // BLSE may already be downloaded or staged; determine the appropriate next installation step.
    const status = getBLSEDeployStatus(api);
    const setUpLabel =
      status === DeployModStatus.NOT_ENABLED
        ? t("Enable BLSE")
        : t("Install BLSE");
    const setUp = (): void => {
      setSettingUp(true);
      void setUpBLSEAsync(api)
        .catch(() => {})
        .finally(() => setSettingUp(false));
    };
    return (
      <div className="bls-launch-bar bls-launch-bar-suggest bls-small">
        <Icon name="feedback-info" className="bls-launch-icon" />
        <div className="bls-launch-text">
          <strong>{t("Launch straight into a save with BLSE")}</strong>
          <span className="bls-muted">
            {t(
              "With the Bannerlord Software Extender, Vortex can start the game in the save you pick here. " +
                "Without it the game opens at the main menu, and the list below only checks your saves against your mods.",
            )}
          </span>
        </div>
        <ActionButton
          variant="primary"
          icon={settingUp ? "spinner" : "download"}
          disabled={settingUp}
          onClick={setUp}
        >
          {settingUp ? t("Setting Up BLSE...") : setUpLabel}
        </ActionButton>
      </div>
    );
  }

  return (
    <div className="bls-launch-bar bls-small">
      <Icon name="launch-application" className="bls-launch-icon" />
      <div className="bls-launch-text">
        <span className="bls-title-xs">{t("Launching from Vortex Loads")}</span>
        <strong>
          {launchSave?.name ?? t("No save, the game opens at the main menu")}
        </strong>
      </div>
      {launchSave !== null && (
        <ActionButton variant="subdued" onClick={() => void onLaunchSave(null)}>
          {t("Don't Load a Save")}
        </ActionButton>
      )}
    </div>
  );
};
