import { init } from "@paralleldrive/cuid2";

const PUBLIC_ID_SUFFIX = /^[a-z][a-z0-9]{23}$/;
const PUBLIC_ID_PATTERN = /^([a-z]+)_([a-z][a-z0-9]{23})$/;
const createPublicIdSuffix = init({ length: 24 });

export const PUBLIC_ID_RESOURCE_REGISTRY = {
  al: "triggeredAlert",
  alr: "alertRule",
  audit: "auditLog",
  check: "rankCheck",
  cmp: "competitor",
  conn: "providerConnection",
  dwh: "ingestHook",
  ferry: "migrationToken",
  imp: "cloudImportJob",
  inv: "invite",
  key: "apiKey",
  kw: "keyword",
  mbr: "membership",
  ntf: "notification",
  pat: "personalAccessToken",
  prj: "project",
  sid: "session",
  sig: "signal",
  svkw: "savedKeyword",
  tag: "tag",
  usr: "user",
  viw: "savedView",
  we: "webhookEndpoint",
} as const;

export type PublicId = `${PublicIdPrefix}_${string}`;
export type PublicIdPrefix = keyof typeof PUBLIC_ID_RESOURCE_REGISTRY;
export type PublicIdResource = (typeof PUBLIC_ID_RESOURCE_REGISTRY)[PublicIdPrefix];
export type PublicIdForPrefix<Prefix extends PublicIdPrefix> = `${Prefix}_${string}`;
export type ParsedPublicId = {
  [Prefix in PublicIdPrefix]: {
    prefix: Prefix;
    resource: (typeof PUBLIC_ID_RESOURCE_REGISTRY)[Prefix];
    suffix: string;
    value: PublicId;
  };
}[PublicIdPrefix];

export function makePublicId(prefix: PublicIdPrefix): string {
  const suffix = createPublicIdSuffix();
  if (!PUBLIC_ID_SUFFIX.test(suffix)) {
    throw new Error("CUID2 generated an invalid public ID suffix.");
  }
  return `${prefix}_${suffix}` as PublicId;
}

export function parsePublicId(value: string): ParsedPublicId | null {
  const match = PUBLIC_ID_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const prefix = match[1] as PublicIdPrefix;
  const resource = PUBLIC_ID_RESOURCE_REGISTRY[prefix];
  if (!resource) {
    return null;
  }

  return { prefix, resource, suffix: match[2], value: value as PublicId } as ParsedPublicId;
}

export function isValidPublicId(value: string): value is PublicId {
  return parsePublicId(value) !== null;
}

/**
 * Parses only the public IDs owned by one resource prefix. Network and UI
 * boundaries can use this to reject legacy internal IDs before querying.
 */
export function parsePublicIdOfType<Prefix extends PublicIdPrefix>(
  value: string,
  expectedPrefix: Prefix,
): Extract<ParsedPublicId, { prefix: Prefix }> | null {
  const parsed = parsePublicId(value);
  if (!parsed || parsed.prefix !== expectedPrefix) {
    return null;
  }
  return parsed as Extract<ParsedPublicId, { prefix: Prefix }>;
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
