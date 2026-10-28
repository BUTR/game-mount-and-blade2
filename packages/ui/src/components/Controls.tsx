import React, { FC, MouseEvent, ReactNode } from "react";
import { Icon, util } from "@nexusmods/vortex-api";

export type ActionButtonProps = {
  variant: "primary" | "moderate" | "subdued" | "weak" | "link";
  icon?: string;
  spin?: boolean;
  large?: boolean;
  block?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string | undefined;
  /**
   * Focused when shown, like a dialog's default button
   */
  autoFocus?: boolean;
  onClick: () => void;
  children: ReactNode;
};

/**
 * Modern UI style button component built from standard markup without requiring internal Vortex UI libraries.
 */
export const ActionButton: FC<ActionButtonProps> = (props) => {
  const {
    variant,
    icon,
    spin,
    large,
    block,
    disabled,
    className,
    title,
    autoFocus,
    onClick,
    children,
  } = props;
  const classes = [
    "bls-btn",
    `bls-btn-${variant}`,
    large && "bls-btn-large",
    block && "bls-btn-block",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={classes}
      title={title}
      disabled={disabled}
      autoFocus={autoFocus}
      onClick={onClick}
    >
      {icon !== undefined && <Icon name={icon} spin={spin === true} />}
      {children}
    </button>
  );
};

/**
 * Link component that opens arbitrary external URLs directly in the system default browser.
 */
export const ExternalLink: FC<{
  url: string;
  className?: string;
  /**
   * Accessible text label for icon-only links, supplied to tooltip and screen reader attributes.
   */
  label?: string;
  children: ReactNode;
}> = ({ url, className, label, children }) => {
  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    util.opn(url).catch(() => null);
  };
  return (
    <a
      href={url}
      title={label !== undefined ? `${label}\n${url}` : url}
      aria-label={label}
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
};

export const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
