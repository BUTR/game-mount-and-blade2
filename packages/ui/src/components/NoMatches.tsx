import React, { FC } from "react";
import { ActionButton } from "./Controls";
import { EmptyState } from "./EmptyState";

/**
 * Shown in place of a list the search and filters left empty, like the Modern UI Mods table's "No mods match"
 */
export const NoMatches: FC<{
  title: string;
  resetLabel: string;
  onReset: () => void;
}> = ({ title, resetLabel, onReset }) => (
  <EmptyState icon="search" title={title}>
    <ActionButton variant="subdued" onClick={onReset}>
      {resetLabel}
    </ActionButton>
  </EmptyState>
);
