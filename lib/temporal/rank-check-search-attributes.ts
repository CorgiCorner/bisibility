import {
  defineSearchAttributeKey,
  type SearchAttributePair,
  SearchAttributeType,
} from "@temporalio/common";

const keywordIdSearchAttribute = defineSearchAttributeKey("keywordId", SearchAttributeType.KEYWORD);
const projectIdSearchAttribute = defineSearchAttributeKey("projectId", SearchAttributeType.KEYWORD);
const providerSearchAttribute = defineSearchAttributeKey("provider", SearchAttributeType.KEYWORD);

export type RankCheckSearchAttributeInput = {
  keywordId: string;
  projectId: string;
  provider?: string;
};

export function rankCheckSearchAttributes(
  input: RankCheckSearchAttributeInput,
): SearchAttributePair[] {
  return [
    { key: keywordIdSearchAttribute, value: input.keywordId },
    { key: projectIdSearchAttribute, value: input.projectId },
    { key: providerSearchAttribute, value: input.provider ?? "primary" },
  ];
}

export function queuedRankCheckSearchAttributes(projectId: string): SearchAttributePair[] {
  return [
    { key: projectIdSearchAttribute, value: projectId },
    { key: providerSearchAttribute, value: "dataforseo" },
  ];
}
