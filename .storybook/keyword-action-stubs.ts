import type { exportKeywords as exportKeywordsAction } from "@/lib/actions/keyword-export-action";

export { addProjectMarkets } from "./browser-runtime-stubs";

type KeywordExportResult = Awaited<ReturnType<typeof exportKeywordsAction>>;

const STORYBOOK_KEYWORD_EXPORT = {
  content: "keyword,position\nstorybook rank tracking,3\n",
  count: 1,
  encoding: "utf8",
  filename: "bisibility-keywords-prj_storybook-current.csv",
  mimeType: "text/csv",
} satisfies KeywordExportResult;

export async function exportKeywords(
  _input: Parameters<typeof exportKeywordsAction>[0],
): Promise<KeywordExportResult> {
  return STORYBOOK_KEYWORD_EXPORT;
}

export async function refreshKeywordViewsAfterImport(): Promise<void> {}
