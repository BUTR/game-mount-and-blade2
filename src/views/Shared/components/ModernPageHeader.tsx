import React, { FC, ReactNode } from "react";
import { Pictogram, PictogramName } from "./Pictogram";

export type ModernPageHeaderProps = {
  title: string;
  subtitle: string;
  /**
   * The illustration beside the title, like the Modern UI pages have
   */
  pictogram?: PictogramName;
  /**
   * Buttons and status shown on the right of the title
   */
  actions?: ReactNode;
};

/**
 * The title row of a page in the Modern UI look (Vortex's PageHeader), see modern.scss
 */
export const ModernPageHeader: FC<ModernPageHeaderProps> = (props) => {
  const { title, subtitle, pictogram, actions } = props;
  return (
    <header className="bls-header">
      {pictogram !== undefined && <Pictogram name={pictogram} />}
      <div className="bls-header-main">
        <div className="bls-header-title">
          <h1>{title}</h1>
          {actions !== undefined && (
            <div className="bls-header-actions">{actions}</div>
          )}
        </div>
        <p>{subtitle}</p>
      </div>
    </header>
  );
};
