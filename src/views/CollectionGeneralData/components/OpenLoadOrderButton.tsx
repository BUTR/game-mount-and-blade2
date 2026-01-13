import React, { useContext } from "react";
import { Button } from "react-bootstrap";
import { MainContext } from "vortex-api";
import { openLoadOrderPage } from "../utils";
import { useLocalization } from "../../../localization";

export const OpenLoadOrderButton = (): JSX.Element => {
  const { localize: t } = useLocalization();

  const context = useContext(MainContext);

  return (
    <Button
      id="btn-more-mods"
      className="collection-add-mods-btn"
      onClick={() => openLoadOrderPage(context.api)}
      bsStyle="ghost"
    >
      {t("Open Load Order Page")}
    </Button>
  );
};
