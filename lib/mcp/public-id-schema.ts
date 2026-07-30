import type { PublicIdPrefix } from "@/lib/db/public-id";

const publicIdSuffixPattern = "[a-z][a-z0-9]{23}";

export function mcpPublicIdSchema(prefix: PublicIdPrefix) {
  return { pattern: `^${prefix}_${publicIdSuffixPattern}$`, type: "string" } as const;
}
