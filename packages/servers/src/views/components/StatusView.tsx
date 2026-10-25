import React, { FC } from "react";
import { tooltip } from "@nexusmods/vortex-api";
import { IServerQueryResult } from "../../types";
import { getStatusText } from "../utils";

export type StatusViewProps = {
  result: IServerQueryResult;
  localize: (key: string) => string;
};

// Custom table cell renderer does not have access to React Context; localization is passed as a prop.
export const StatusView: FC<StatusViewProps> = (props) => {
  const { result, localize: t } = props;

  const label = getStatusText(result, t);
  switch (result.state) {
    case "pending":
      return (
        <span className="bls-status">
          <tooltip.Icon name="spinner" tooltip={label} />
          <span className="bls-status-label">{label}</span>
        </span>
      );
    case "online":
      return (
        <span
          className="bls-status"
          title={t("Map list and BUTR details available")}
        >
          <span className="bls-dot is-available" />
          <span className="bls-status-label">{label}</span>
        </span>
      );
    case "unreachable":
      // Dedicated servers communicate gameplay over UDP; only metadata is served over TCP.
      return (
        <span
          className="bls-status"
          title={t(
            "The server does not publish details over TCP. Joining is not affected.",
          )}
        >
          <span className="bls-dot" />
          <span className="bls-status-label">{label}</span>
        </span>
      );
    case "invalid":
      return (
        <span className="bls-status">
          <tooltip.Icon
            name="feedback-warning"
            className="bls-warning"
            tooltip={result.error ?? label}
          />
          <span className="bls-status-label">{label}</span>
        </span>
      );
  }
};
