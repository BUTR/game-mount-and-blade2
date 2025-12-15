import React from "react";

export type IssueSnippetProps = {
  issueHeading: string;
  issue: string[] | undefined;
};

export const IssueSnippet = (props: IssueSnippetProps): JSX.Element => {
  const { issueHeading, issue } = props;

  if (issue && issue.length) {
    return (
      <>
        <p>{issueHeading}</p>
        <ul>
          {issue.map<React.JSX.Element>((object) => (
            <li key={object}>{object}</li>
          ))}
        </ul>
      </>
    );
  }

  return <></>;
};
