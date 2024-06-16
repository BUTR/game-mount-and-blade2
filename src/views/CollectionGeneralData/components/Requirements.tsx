import React from 'react';
import { ListGroup } from 'react-bootstrap';
import { useLocalization } from '../../../utils';

export type RequirementsProps = {
  hasBLSE: boolean;
};

export const Requirements = (props: RequirementsProps): JSX.Element => {
  const { hasBLSE } = props;

  const { localize: t } = useLocalization();

  return (
    <>
      <h4>{t('Requirements')}</h4>
      <ListGroup id="collections-load-order-list">
        <span>{t('Require BLSE to be installed')}</span>
        <span>{': '}</span>
        {hasBLSE ? <span>{t('Yes')}</span> : <span>{t('No')}</span>}
      </ListGroup>
    </>
  );
};
