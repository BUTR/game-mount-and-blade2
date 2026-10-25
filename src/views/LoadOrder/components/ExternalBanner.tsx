import React, { FC } from "react";
import { Icon, types } from "@nexusmods/vortex-api";
import { IVortexViewModelData } from "@bannerlord/core/types";
import { isExternal } from "../utils";
import { useLocalization } from "@bannerlord/core/localization/hooks";

export type ExternalBannerProps = {
  item: types.IFBLOLoadOrderEntry<IVortexViewModelData>;
};

export const ExternalBanner: FC<ExternalBannerProps> = (props) => {
  const { item } = props;

  const { localize: t } = useLocalization();

  return isExternal(item) ? (
    <div className="load-order-unmanaged-banner">
      <Icon className="external-caution-logo" name="feedback-warning" />
      <span className="external-text-area">{t("Not managed by Vortex")}</span>
    </div>
  ) : null;
};
