import React, { FC } from "react";

export type IssueSnippetProps = {
  issueHeading: string;
  issue: string[] | undefined;
};

export const IssueSnippet: FC<IssueSnippetProps> = (props) => {
  const { issueHeading, issue } = props;

  if (issue && issue.length) {
    return (
      <>
        <p>{issueHeading}</p>
        <ul>
          {issue.map((object) => (
            <li key={object}>{object}</li>
          ))}
        </ul>
      </>
    );
  }

  return null;
};
