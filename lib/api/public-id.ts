import { isPublicIdOfType, type PublicIdForPrefix, type PublicIdPrefix } from "@/lib/db/public-id";
import { ApiInputError } from "./errors";

function label(prefix: PublicIdPrefix) {
  return prefix === "prj" ? "project" : "resource";
}

export function requireApiPublicId<Prefix extends PublicIdPrefix>(
  value: unknown,
  expectedPrefix: Prefix,
): PublicIdForPrefix<Prefix> {
  if (typeof value !== "string" || !isPublicIdOfType(value, expectedPrefix)) {
    throw new ApiInputError(
      `Expected a v3 public ${label(expectedPrefix)} ID.`,
      "invalid_public_id",
    );
  }
  return value;
}

function requirePathId(path: string[], index: number, prefix: PublicIdPrefix) {
  const value = path[index];
  if (value) requireApiPublicId(value, prefix);
}

type AlertRulePublicIdInput = {
  recipientIds?: string[];
  targetIds: string[];
  targetType: "all" | "keyword" | "tag";
};

/** Reject raw alert-rule body identifiers at the REST boundary. */
export function requireApiAlertRulePublicIds(input: AlertRulePublicIdInput) {
  for (const recipientId of input.recipientIds ?? []) requireApiPublicId(recipientId, "usr");
  if (input.targetType === "all" && input.targetIds.length > 0) {
    throw new ApiInputError("All-target rules cannot include target IDs.", "bad_request");
  }
  if (input.targetType === "keyword") {
    for (const targetId of input.targetIds) requireApiPublicId(targetId, "kw");
  }
  if (input.targetType === "tag") {
    for (const targetId of input.targetIds) requireApiPublicId(targetId, "tag");
  }
}

/** Reject raw IDs at the REST dispatcher before a service can query by one. */
export function requireApiPathPublicIds(path: string[]) {
  const [first, second, third, fourth, fifth] = path;
  if (first === "projects" && second) {
    requireApiPublicId(second, "prj");
    if (third === "webhooks") requirePathId(path, 3, "we");
    if (third === "saved-keywords") requirePathId(path, 3, "svkw");
    if (third === "saved-views") requirePathId(path, 3, "viw");
    if (third === "competitors") requirePathId(path, 3, "cmp");
    if (third === "migration-tokens") requirePathId(path, 3, "ferry");
    if (third === "sitemap-monitors") requirePathId(path, 3, "prj");
    if (third === "team" && fourth === "members") requirePathId(path, 4, "mbr");
    if (third === "team" && fourth === "invites") requirePathId(path, 4, "inv");
    if (third === "triggered-alerts" && fourth && fifth === "mute") requirePathId(path, 3, "al");
    return;
  }
  if (first === "keywords" && second && second !== "bulk") requireApiPublicId(second, "kw");
  if (first === "rank-checks" && second) requireApiPublicId(second, "check");
  if (first === "alert-rules" && second) requireApiPublicId(second, "alr");
  if (first === "api-keys" && second) requireApiPublicId(second, "key");
  if (first === "saved-views" && second) requireApiPublicId(second, "viw");
  if (first === "competitors" && second) requireApiPublicId(second, "cmp");
  if (first === "migration-tokens" && second) requireApiPublicId(second, "ferry");
  if (first === "team" && second === "invites" && third) requireApiPublicId(third, "inv");
}

export function requireAccountPathPublicIds(path: string[]) {
  if (path[0] === "me" && path[1] === "tokens" && path[2] && path[2] !== "current") {
    requireApiPublicId(path[2], "pat");
  }
}
