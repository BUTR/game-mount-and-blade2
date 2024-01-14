import React from 'react';
import { ListGroupItem, Radio } from 'react-bootstrap';
import { ComponentEx, FlexLayout } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';

interface IStateProps {}
type IOwnProps = {
  item: vetypes.SaveMetadata;
  onSelected: (saveMetadata: vetypes.SaveMetadata) => void;
};

interface IBaseState {}

type IComponentProps = IStateProps & IOwnProps;
type IComponentState = IBaseState;
class SaveListEntry extends ComponentEx<IComponentProps, IComponentState> {
  constructor(props: IComponentProps) {
    console.log(`SaveListEntry`);
    super(props);
  }

  public override render(): JSX.Element {
    const { item } = this.props;

    return (
      <ListGroupItem
        style={{
          backgroundColor: `var(--brand-bg, black)`,
          borderBottom: `2px solid var(--border-color, white)`,
        }}
      >
        <FlexLayout type="row">
          {/* TODO: How to FlexLayout.Flex? */}

          <FlexLayout.Flex>
            <div style={{ display: `flex`, alignItems: `center` }}>
              <Radio name="groupOptions">
                {item.Name} | {item['ApplicationVersion']} | {item['CharacterName']} | {item['MainHeroLevel']} | {item['DayLong']} |{' '}
                {item['CreationTime']}
              </Radio>
            </div>
          </FlexLayout.Flex>
        </FlexLayout>
      </ListGroupItem>
    );
  }
}

export default SaveListEntry;
