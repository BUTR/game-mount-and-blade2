import React, { FC } from "react";
import { EmptyPlaceholder } from "@nexusmods/vortex-api";
import { OpenLoadOrderButton } from "./OpenLoadOrderButton";
import { useLocalization } from "../../../localization/hooks";

export const Placeholder: FC = () => {
  const { localize: t } = useLocalization();

  return (
    <EmptyPlaceholder
      icon="sort-none"
      text={t(
        "You have no load order entries (for the current mods in the collection)",
      )}
      subtext={<OpenLoadOrderButton />}
    />
  );
};
