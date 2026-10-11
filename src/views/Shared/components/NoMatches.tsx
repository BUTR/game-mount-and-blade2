import React, { FC } from "react";
import { Icon } from "vortex-api";
import { ActionButton } from "./Controls";

/**
 * Shown in place of a list the search and filters left empty, like the Modern UI Mods table's "No mods match"
 */
export const NoMatches: FC<{
  title: string;
  resetLabel: string;
  onReset: () => void;
}> = ({ title, resetLabel, onReset }) => (
  <div className="bls-empty bls-small">
    <span className="bls-empty-icon">
      <Icon name="search" />
    </span>
    <h2>{title}</h2>
    <ActionButton variant="subdued" onClick={onReset}>
      {resetLabel}
    </ActionButton>
  </div>
);
