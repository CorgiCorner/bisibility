export type { TagPageRuleKind, TagPatternCode, TagRulePage, TagRuleShape } from "./tag-pattern";
export {
  compileTagPattern,
  matchPagesForRule,
  splitTagRuleLines,
  stripTagPatternSlash,
  TAG_PATTERN_MAX_LENGTH,
  TAG_PATTERN_MAX_WILDCARDS,
  TAG_RULE_EXCLUDE_MAX,
  TAG_RULE_URL_MAX,
  TagPatternError,
  tagPageRuleKinds,
  tagPatternCode,
} from "./tag-pattern";

type ApplyModule = typeof import("./tag-rule-apply");

/** Database reconciliation stays in a server module so pattern checks stay pure. */
export async function applyTagPageRule(tagId: string) {
  const { applyTagPageRule: run } = (await import("./tag-rule-apply")) as ApplyModule;
  return run(tagId);
}

export async function applyAutoJoinPageTagRules(projectId: string) {
  const { applyAutoJoinPageTagRules: run } = (await import("./tag-rule-apply")) as ApplyModule;
  return run(projectId);
}

export type { TagRuleApplyResult } from "./tag-rule-apply";
