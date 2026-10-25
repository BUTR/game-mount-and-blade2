import React, { FC } from "react";
import { Icon, types } from "@nexusmods/vortex-api";
import { IVortexViewModelData } from "@bannerlord/core/types";
import { useLocalization } from "@bannerlord/core/localization/hooks";

export type OptionalBannerProps = {
  item: types.IFBLOLoadOrderEntry<IVortexViewModelData>;
};

export const OptionalBanner: FC<OptionalBannerProps> = (props) => {
  const { item } = props;

  const { localize: t } = useLocalization();

  return isOptional(item) ? (
    <div className="load-order-unmanaged-banner">
      <Icon className="external-caution-logo" name="feedback-warning" />
      <span className="external-text-area">
        {t("Not in the collection. Optional")}
      </span>
    </div>
  ) : null;
};

export const isOptional = (
  item: types.IFBLOLoadOrderEntry<IVortexViewModelData>,
): boolean => {
  return (
    item.modId === undefined &&
    item.data !== undefined &&
    !item.data.moduleInfoExtended.isOfficial
  );
};
