import { ApiInputError } from "@/lib/api/errors";
import { isPublicIdOfType, type PublicIdPrefix } from "@/lib/db/public-id";
import type { JsonObject } from "./types";

const publicIdInputs = {
  alert_id: "al",
  check_id: "check",
  competitor_id: "cmp",
  connection_id: "conn",
  invite_id: "inv",
  key_id: "key",
  keyword_id: "kw",
  member_id: "mbr",
  monitor_id: "prj",
  project_id: "prj",
  rule_id: "alr",
  saved_keyword_id: "svkw",
  view_id: "viw",
  webhook_id: "we",
} as const satisfies Record<string, PublicIdPrefix>;

function requireMcpPublicId(value: string, prefix: PublicIdPrefix) {
  if (!isPublicIdOfType(value, prefix)) {
    throw new ApiInputError("Expected a v3 public ID.", "invalid_public_id");
  }
}

export function validateMcpPublicIds(name: string, input: JsonObject) {
  for (const [key, prefix] of Object.entries(publicIdInputs)) {
    const value = input[key];
    if (typeof value === "string") requireMcpPublicId(value, prefix);
  }
  if (Array.isArray(input.keyword_ids)) {
    for (const value of input.keyword_ids) {
      if (typeof value !== "string")
        throw new ApiInputError("Expected a v3 public ID.", "invalid_public_id");
      requireMcpPublicId(value, "kw");
    }
  }
  if (Array.isArray(input.recipient_ids)) {
    for (const value of input.recipient_ids) {
      if (typeof value !== "string")
        throw new ApiInputError("Expected a v3 public ID.", "invalid_public_id");
      requireMcpPublicId(value, "usr");
    }
  }
  if (Array.isArray(input.target_ids)) {
    const prefix =
      input.target_type === "keyword" ? "kw" : input.target_type === "tag" ? "tag" : null;
    if (!prefix && input.target_ids.length > 0) {
      throw new ApiInputError("All-target rules cannot include target IDs.", "bad_request");
    }
    if (prefix) {
      for (const value of input.target_ids) {
        if (typeof value !== "string")
          throw new ApiInputError("Expected a v3 public ID.", "invalid_public_id");
        requireMcpPublicId(value, prefix);
      }
    }
  }
  if (typeof input.token_id === "string") {
    requireMcpPublicId(input.token_id, name === "revokePersonalToken" ? "pat" : "ferry");
  }
}
