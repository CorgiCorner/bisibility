import { createHash } from "node:crypto";
import type { ReserveInput } from "@usagekit/core";

export { canonical, effective, key, plus } from "@usagekit/store/reference";

import { canonical } from "@usagekit/store/reference";

export const encode = (value: unknown): string =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? { $bigint: v.toString() } : v));
export const decode = <T>(value: unknown): T =>
  JSON.parse(typeof value === "string" ? value : JSON.stringify(value), (_, v) =>
    v && typeof v === "object" && Object.keys(v).length === 1 && typeof v.$bigint === "string"
      ? BigInt(v.$bigint)
      : v,
  ) as T;
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function identity(input: ReserveInput): string {
  const {
    correlationId: _,
    parentOperationId: __,
    estimateSource: _source,
    providerPriceVersion: _priceVersion,
    scope,
    ...rest
  } = input;
  const { tags: _tags, ...scopeIdentity } = scope;
  return canonical({
    ...rest,
    scope: scopeIdentity,
    estimate: [...input.estimate].sort((a, b) => a.unit.localeCompare(b.unit)),
    platformPools: [...(input.platformPools ?? [])].sort(),
  });
}
export const timestamp = (value: Date | string) => new Date(value).toISOString();
