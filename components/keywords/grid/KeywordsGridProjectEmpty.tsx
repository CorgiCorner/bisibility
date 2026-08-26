"use client";
import type { ReactNode } from "react";
import { KeywordsEmptyState } from "./KeywordsEmptyState";
import type { AddKeywordDraft } from "./KeywordsGridDialogs";
import type { KeywordsGridProps } from "./keywords-grid-types";

type Props = Pick<
  KeywordsGridProps,
  | "canCreateKeyword"
  | "canManageProviders"
  | "costContext"
  | "importTopQueriesAction"
  | "providerConnected"
  | "projectId"
  | "searchConsoleConnected"
> & {
  dialogs: ReactNode;
  onAddKeyword: () => void;
  onImportCsv: () => void;
  openAddDrawer: (keyword?: string, tab?: AddKeywordDraft["tab"]) => void;
};
export function KeywordsGridProjectEmpty(props: Props) {
  return (
    <section className="grid w-full min-w-0 gap-4">
      <KeywordsEmptyState
        canCreateKeyword={props.canCreateKeyword}
        canManageProviders={props.canManageProviders}
        costContext={props.costContext}
        importTopQueriesAction={props.importTopQueriesAction}
        onAddKeyword={props.onAddKeyword}
        onImportCsv={props.onImportCsv}
        onImportQueries={(queries) => props.openAddDrawer(queries.join("\n"))}
        providerConnected={props.providerConnected}
        projectId={props.projectId}
        searchConsoleConnected={props.searchConsoleConnected}
      />
      {props.dialogs}
    </section>
  );
}
