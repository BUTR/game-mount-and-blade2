import React, { FC, ReactNode } from "react";
import { Icon } from "@nexusmods/vortex-api";

export type EmptyStateProps = {
  /**
   * A Vortex icon over the title, none for a bare heading
   */
  icon?: string;
  /**
   * The icon in the primary color, for a page's first run
   */
  primary?: boolean;
  title: ReactNode;
  /**
   * Explains the state, under the title
   */
  description?: ReactNode;
  /**
   * Buttons and the like, after the text
   */
  children?: ReactNode;
  /**
   * Announced as it changes, for a loading state
   */
  status?: boolean;
  /**
   * Replaces the default `bls-small`, like a page's first run
   */
  className?: string;
};

/**
 * Shown in place of a list or a panel that has nothing yet, is loading or failed: an icon, a heading and a line
 * about it, like the Modern UI Mods table's "No mods yet"
 */
export const EmptyState: FC<EmptyStateProps> = ({
  icon,
  primary = false,
  title,
  description,
  children,
  status = false,
  className = "bls-small",
}) => (
  <div
    className={`bls-empty ${className}`}
    role={status ? "status" : undefined}
  >
    {icon !== undefined && (
      <span
        className={
          primary ? "bls-empty-icon bls-empty-icon-primary" : "bls-empty-icon"
        }
      >
        <Icon name={icon} />
      </span>
    )}
    <h2>{title}</h2>
    {description !== undefined && <p>{description}</p>}
    {children}
  </div>
);
