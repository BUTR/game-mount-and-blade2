import React, { CSSProperties } from 'react';
import { OverlayTrigger, Popover } from 'react-bootstrap';
import { ITooltipProps } from 'vortex-api/lib/controls/TooltipControls';

export type TooltipImageProps = ITooltipProps & {
  className?: string;
  fixedWidth?: boolean;
  flip?: 'horizontal' | 'vertical';
  src: string;
  style?: CSSProperties;
};

export const TooltipImage = (props: TooltipImageProps): JSX.Element => {
  const { tooltip, placement, ...relayProps } = props;

  const classes = ['fake-link'].concat((props.className ?? '').split(' '));

  if (typeof props.tooltip === 'string') {
    return (
      <a className={classes.join(' ')} title={props.tooltip}>
        <img {...relayProps} />
      </a>
    );
  } else {
    const tooltip = <Popover id={props.id}>{props.tooltip}</Popover>;

    return (
      <OverlayTrigger overlay={tooltip} placement={props.placement ?? 'bottom'} delayShow={300} delayHide={150}>
        <a className={classes.join(' ')}>
          <img {...relayProps} />
        </a>
      </OverlayTrigger>
    );
  }
};
