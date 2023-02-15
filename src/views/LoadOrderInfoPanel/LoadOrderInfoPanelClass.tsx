import * as React from 'react';
import { IInfoPanelProps } from 'vortex-api/lib/extensions/mod_load_order/types/types';
import { LoadOrderInfoPanel } from './LoadOrderInfoPanel';

export class LoadOrderInfoPanelClass extends React.Component<IInfoPanelProps, {}, any> {

	constructor(props: IInfoPanelProps) {
		super(props);
	}

	render = (): React.ReactNode => {
		return (<LoadOrderInfoPanel {...this.props} ></LoadOrderInfoPanel>)
	}
}