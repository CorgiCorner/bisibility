import {
  PUBLIC_ID_RESOURCE_REGISTRY as CORE_PUBLIC_ID_RESOURCE_REGISTRY,
  type ParsedPublicId as CoreParsedPublicId,
  makePublicId as makeCorePublicId,
  parsePublicId as parseCorePublicId,
} from "./public-id.ts";

// The core module is an immutable input to historical data migrations. Extend
// runtime resources here so new IDs preserve its parser and generator contract.
export const PUBLIC_ID_RESOURCE_REGISTRY = {
  ...CORE_PUBLIC_ID_RESOURCE_REGISTRY,
  agr: "agentReport",
} as const;

export type PublicIdPrefix = keyof typeof PUBLIC_ID_RESOURCE_REGISTRY;
export type PublicIdResource = (typeof PUBLIC_ID_RESOURCE_REGISTRY)[PublicIdPrefix];
export type PublicId = `${PublicIdPrefix}_${string}`;
export type PublicIdForPrefix<Prefix extends PublicIdPrefix> = `${Prefix}_${string}`;
export type ParsedPublicId =
  | CoreParsedPublicId
  | { prefix: "agr"; resource: "agentReport"; suffix: string; value: PublicId };

export function makePublicId(prefix: PublicIdPrefix): string {
  return prefix === "agr" ? `agr_${makeCorePublicId("prj").slice(4)}` : makeCorePublicId(prefix);
}

export function parsePublicId(value: string): ParsedPublicId | null {
  if (!value.startsWith("agr_")) return parseCorePublicId(value);
  const parsed = parseCorePublicId(`prj_${value.slice(4)}`);
  return parsed
    ? { prefix: "agr", resource: "agentReport", suffix: parsed.suffix, value: value as PublicId }
    : null;
}

export function isValidPublicId(value: string): value is PublicId {
  return parsePublicId(value) !== null;
}

export function parsePublicIdOfType<Prefix extends PublicIdPrefix>(
  value: string,
  expectedPrefix: Prefix,
): Extract<ParsedPublicId, { prefix: Prefix }> | null {
  const parsed = parsePublicId(value);
  return parsed?.prefix === expectedPrefix
    ? (parsed as Extract<ParsedPublicId, { prefix: Prefix }>)
    : null;
}

export function isPublicIdOfType<Prefix extends PublicIdPrefix>(
  value: string,
  expectedPrefix: Prefix,
): value is PublicIdForPrefix<Prefix> {
  return parsePublicIdOfType(value, expectedPrefix) !== null;
}

export function requirePublicId<Prefix extends PublicIdPrefix>(
  value: unknown,
  expectedPrefix: Prefix,
): PublicIdForPrefix<Prefix> {
  if (typeof value !== "string" || !isPublicIdOfType(value, expectedPrefix)) {
    throw new Error(`Expected a strict ${expectedPrefix}_ v3 public ID.`);
  }
  return value;
}
