import React, { FC } from "react";
import { tooltip } from "vortex-api";
import { ISaveGame } from "../types";
import { countIssues } from "../utils";

export type StatusViewProps = {
  save: ISaveGame;
  localize: (key: string, values?: Record<string, string>) => string;
};

// Custom Renderer has no Context access
export const StatusView: FC<StatusViewProps> = (props) => {
  const { save, localize: t } = props;

  const issues = countIssues(save);
  if (issues === 0) {
    return (
      <span className="bls-status">
        <tooltip.Icon
          name="toggle-enabled"
          className="bls-ok"
          tooltip={t("Matches your installed mods")}
        />
        <span className="bls-status-label">{t("None")}</span>
      </span>
    );
  }

  const summary = [
    [save.loadOrderIssues, t("load order issues")],
    [save.missingModules, t("missing modules")],
    [save.duplicateModules, t("duplicate modules")],
    [save.mismatchedModuleVersions, t("version mismatches")],
  ]
    .filter(([list]) => (list as string[] | undefined)?.length)
    .map(([list, label]) => `${(list as string[]).length} ${label as string}`)
    .join("\n");

  return (
    <span className="bls-status">
      <tooltip.Icon
        name="feedback-warning"
        className="bls-warning"
        tooltip={summary}
      />
      <span className="bls-status-label">
        {issues === 1
          ? t("1 issue")
          : t("{{count}} issues", { count: `${issues}` })}
      </span>
    </span>
  );
};
