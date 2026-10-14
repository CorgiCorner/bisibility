import { createHash } from "node:crypto";
import { trackedProjectDomain } from "@/lib/schemas/project";
import type { SerpDepth } from "@/lib/serp/constants";

export function rankRecoveryContext(
  input: {
    text: string;
    device: string;
    domain: string;
    location: { id?: string; languageCode?: string };
    revision?: Date;
  },
  depth: SerpDepth,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.text,
        input.device,
        input.domain,
        input.location.id ?? null,
        input.location.languageCode ?? null,
        depth,
        input.revision?.toISOString() ?? null,
      ]),
    )
    .digest("hex");
}

export function preparedRankRecoveryContext(
  keyword: {
    text: string;
    device: string;
    locationRef: { id: string; languageCode: string };
    updatedAt: Date;
  },
  domain: string | null,
  depth?: SerpDepth,
) {
  return depth
    ? rankRecoveryContext(
        {
          text: keyword.text,
          device: keyword.device,
          domain: trackedProjectDomain(domain) ?? "",
          location: keyword.locationRef,
          revision: keyword.updatedAt,
        },
        depth,
      )
    : null;
}
