import * as React from 'react';
import { ListGroupItem } from 'react-bootstrap';
import { ComponentEx } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';

interface IStateProps {
    
};
type IOwnProps = {
    item: vetypes.SaveMetadata;
    onSelected: (saveMetadata: vetypes.SaveMetadata) => void
};

interface IBaseState {

};

type IComponentProps = IStateProps & IOwnProps;
type IComponentState = IBaseState;
class SaveListEntry extends ComponentEx<IComponentProps, IComponentState> {

    constructor(props: IComponentProps) {
        super(props);
    }

    public render() {
        const { item } = this.props;

        return (
            <ListGroupItem style={{
                backgroundColor: 'var(--brand-bg, black)',
                borderBottom: '2px solid var(--border-color, white)'
            }}>
                <div style={{
                    fontSize: '1.1em',
                }}>
                    <div>{item.Name}</div>
                    {/*
                    <div>{item.ApplicationVersion ?? 'Save Old'}</div>
                    <div>{item.CharacterName ?? 'Save Old'}</div>
                    <div>{item.MainHeroLevel ?? 'Save Old'}</div>
                    <div>{item.DayLong ?? 'Save Old'}</div>
                    <div>{item.CreationTime ?? 'Save Old'}</div>
                    */}
                </div>
            </ListGroupItem>
        );
    }
}

export default SaveListEntry;