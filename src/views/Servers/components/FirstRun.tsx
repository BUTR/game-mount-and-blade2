import React, { FC } from "react";
import { Icon } from "@nexusmods/vortex-api";
import { ActionButton } from "../../Shared/components/Controls";
import { useLocalization } from "../../../localization/hooks";

export type FirstRunProps = {
  lobbyLoading: boolean;
  onRefreshLobby: () => void;
  onAddServer: () => void;
};

/**
 * Rendered in place of the empty server table before the lobby has been fetched or any servers have been added.
 */
export const FirstRun: FC<FirstRunProps> = (props) => {
  const { lobbyLoading, onRefreshLobby, onAddServer } = props;

  const { localize: t } = useLocalization();

  const steps = [
    {
      title: t("Pick a server"),
      text: t(
        "See which mods and custom maps it needs, and which you already have.",
      ),
    },
    {
      title: t("Get what's missing"),
      text: t(
        "Install the server's collection and download its maps from the server.",
      ),
    },
    {
      title: t("Join"),
      text: t(
        "Vortex creates a dedicated profile with the required mods, launches the game, and connects.",
      ),
    },
  ];

  return (
    <section className="bls-empty bls-first-run">
      <span className="bls-empty-icon bls-empty-icon-primary">
        <Icon name="game" />
      </span>
      <h2>{t("Find a server to play on")}</h2>
      <p>
        {t(
          "Vortex signs in to the official multiplayer lobby with your platform account, the same way the game does, " +
            "and lists the custom servers with the mods they run.",
        )}
      </p>
      <div className="bls-first-run-actions">
        <ActionButton
          variant="primary"
          large
          icon={lobbyLoading ? "spinner" : "refresh"}
          disabled={lobbyLoading}
          onClick={onRefreshLobby}
        >
          {lobbyLoading
            ? t("Signing in to the lobby...")
            : t("Check the Lobby")}
        </ActionButton>
        <ActionButton variant="moderate" large onClick={onAddServer}>
          {t("Add Server by Address")}
        </ActionButton>
      </div>
      <ol className="bls-steps">
        {steps.map((step, index) => (
          <li key={step.title} className="bls-small">
            <span className="bls-title-xs">
              {t("Step {{number}}", { number: `${index + 1}` })}
            </span>
            <strong>{step.title}</strong>
            <span className="bls-muted">{step.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};
