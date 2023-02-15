import * as React from 'react';
import { Panel, ListGroup } from 'react-bootstrap';
import { ComponentEx, FlexLayout, IconBar,  MainPage, ToolbarIcon, types } from 'vortex-api';
import SaveEntry from './SaveListEntry';
import { IItemRendererProps } from '../../types';
import { VortexLauncherManager } from '../../utils/VortexLauncherManager';
import { types as vetypes } from '@butr/vortexextensionnative';

interface IStateProps {
    
};
type IOwnProps = IItemRendererProps & {
    launcherManager: VortexLauncherManager;
};

interface IBaseState {
    saves: vetypes.SaveMetadata[];
};

type IComponentProps = IStateProps & IOwnProps;
type IComponentState = IBaseState;
class SaveList extends ComponentEx<IComponentProps, IComponentState> {

    private mStaticButtons: types.IActionDefinition[];

    constructor(props: IComponentProps) {
        super(props);

        const saves = props.launcherManager.getSaveFiles();

        this.initState({
            saves: saves,
        });

        this.mStaticButtons = [
            {
                component: ToolbarIcon,
                props: () => {
                    return {
                        id: 'btn-refresh-list',
                        key: 'btn-refresh-list',
                        icon: 'refresh',
                        text: 'Refresh List',
                        className: 'load-order-refresh-list',
                        onClick: this.onRefreshList,
                    };
                },
            },
        ];
    }

    public render(): JSX.Element {
        const { t } = this.props;

        return (
        <MainPage>
            <MainPage.Header>
            <IconBar
                group='bannerlord-saves-icons'
                staticElements={this.mStaticButtons}
                className='menubar'
                t={t!}
            />
            </MainPage.Header>
            <MainPage.Body>
            {this.renderContent()}
            </MainPage.Body>
        </MainPage>
        );
    }

    private renderContent() {
        const { saves } = this.state;
        
        return (
            <Panel>
              <Panel.Body>
                <FlexLayout type='column'>
                <FlexLayout.Flex>
                    <ListGroup>
                        {saves.map((item) => (
                            <SaveEntry item={item} onSelected={this.onSaveSelected}></SaveEntry>
                        ))}
                    </ListGroup>
                  </FlexLayout.Flex>
                </FlexLayout>
              </Panel.Body>
            </Panel>
        );
    }

    private onRefreshList = () => {
        const { launcherManager } = this.props;

        const saves = launcherManager.getSaveFiles();
        this.setState({
            saves: saves,
        });
    }

    private onSaveSelected = (saveMetadata: vetypes.SaveMetadata) => {
        const { launcherManager } = this.props;

        launcherManager.setGameParameterSaveFile(saveMetadata.Name)
    }
}

export default SaveList;