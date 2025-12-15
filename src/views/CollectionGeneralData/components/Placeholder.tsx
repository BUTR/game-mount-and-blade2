import React from "react";
import { EmptyPlaceholder } from "vortex-api";
import { OpenLoadOrderButton } from "./OpenLoadOrderButton";
import { useLocalization } from "../../../localization";

export const Placeholder = (): JSX.Element => {
  const { localize: t } = useLocalization();

  return (
    <EmptyPlaceholder
      icon="sort-none"
      text={t(
        "You have no load order entries (for the current mods in the collection)",
      )}
      subtext={OpenLoadOrderButton()}
    />
  );
};
