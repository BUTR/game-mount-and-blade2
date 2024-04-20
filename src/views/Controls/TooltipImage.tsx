import * as React from 'react';
import { OverlayTrigger, Popover } from 'react-bootstrap';
import { ITooltipProps } from 'vortex-api/lib/controls/TooltipControls';

export interface ITooltipImgProps {
  className?: string;
  fixedWidth?: boolean;
  flip?: 'horizontal' | 'vertical';
  src: string;
  style?: React.CSSProperties;
}
export type ImgProps = ITooltipProps & ITooltipImgProps;

export class TooltipImage extends React.Component<ImgProps, unknown> {
  public override render() {
    const { tooltip, placement, ...relayProps } = this.props;

    const classes = ['fake-link'].concat((this.props.className || '').split(' '));

    if (typeof this.props.tooltip === 'string') {
      return (
        <a className={classes.join(' ')} title={this.props.tooltip}>
          <img {...relayProps} />
        </a>
      );
    } else {
      const tooltip = <Popover id={this.props.id}>{this.props.tooltip}</Popover>;

      return (
        <OverlayTrigger overlay={tooltip} placement={this.props.placement || 'bottom'} delayShow={300} delayHide={150}>
          <a className={classes.join(' ')}>
            <img {...relayProps} />
          </a>
        </OverlayTrigger>
      );
    }
  }
}
