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
          {issue.map<React.JSX.Element>((object, i) => (
            <li key={i}>{object}</li>
          ))}
        </ul>
      </>
    );
  }

  return <></>;
};
