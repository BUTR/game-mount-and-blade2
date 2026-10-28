import React, { FC } from "react";
import { EmptyPlaceholder } from "@nexusmods/vortex-api";
import { useLocalization } from "@bannerlord/core/localization/hooks";

export const Placeholder: FC = () => {
  const { localize: t } = useLocalization();

  return (
    <EmptyPlaceholder
      icon="sort-none"
      text={t("You have no Mod Configuration Menu options available")}
      subtext={t(
        "This collection will not have any Mod Configuration Menu options available.",
      )}
    />
  );
};
