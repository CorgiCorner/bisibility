import { centsToDollars } from "@/lib/format/currency";
import { requireApiPublicId } from "./public-id";

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

export function apiKeyAuditResource(value: {
  expiresAt: Date | null;
  name: string;
  prefix: string;
  publicId: string | null;
  revokedAt: Date | null;
  scopes: readonly string[];
}) {
  return {
    expiresAt: iso(value.expiresAt),
    id: requireApiPublicId(value.publicId ?? "", "key"),
    name: value.name,
    prefix: value.prefix,
    revokedAt: iso(value.revokedAt),
    scopes: [...value.scopes],
  };
}

export function personalTokenAuditResource(value: {
  expiresAt: Date | null;
  name: string;
  prefix: string;
  publicId: string | null;
  revokedAt: Date | null;
  scopes: readonly string[];
}) {
  return {
    expiresAt: iso(value.expiresAt),
    id: requireApiPublicId(value.publicId ?? "", "pat"),
    name: value.name,
    prefix: value.prefix,
    revokedAt: iso(value.revokedAt),
    scopes: [...value.scopes],
  };
}

export function projectAuditResource(value: {
  domain: string | null;
  name: string;
  publicId: string | null;
  trackingScope?: string;
  writeMode?: string;
}) {
  return {
    domain: value.domain ?? null,
    id: requireApiPublicId(value.publicId ?? "", "prj"),
    name: value.name,
    trackingScope: value.trackingScope,
    writeMode: value.writeMode,
  };
}

export function alertRuleAuditResource(value: {
  channels: readonly string[];
  changePct?: unknown;
  competitorDomain?: string | null;
  conditionType: string;
  dropPositions?: number | null;
  enabled: boolean;
  markets?: { projectMarket: { publicId: string | null } }[];
  name: string;
  publicId: string | null;
  serpFeature?: string | null;
  severity: string;
  targetType: string;
  thresholdPosition?: number | null;
  topN?: number | null;
}) {
  return {
    channels: [...(value.channels ?? [])],
    changePct: value.changePct == null ? null : Number(value.changePct),
    competitorDomain: value.competitorDomain ?? null,
    conditionType: value.conditionType,
    dropPositions: value.dropPositions ?? null,
    enabled: value.enabled,
    id: requireApiPublicId(value.publicId ?? "", "alr"),
    marketIds: (value.markets ?? []).map(({ projectMarket }) =>
      requireApiPublicId(projectMarket.publicId ?? "", "pmkt"),
    ),
    name: value.name,
    serpFeature: value.serpFeature ?? null,
    severity: value.severity,
    targetType: value.targetType,
    thresholdPosition: value.thresholdPosition ?? null,
    topN: value.topN ?? null,
  };
}

export function providerConnectionAuditResource(value: {
  costPerCheckCents?: unknown;
  credentialsEncrypted?: string | null;
  enabled: boolean;
  kind: string;
  priority: number;
  provider: string;
  publicId: string | null;
  status: string;
}) {
  return {
    costPerCheck:
      value.costPerCheckCents == null ? null : centsToDollars(Number(value.costPerCheckCents)),
    enabled: value.enabled,
    hasCredentials: Boolean(value.credentialsEncrypted),
    id: requireApiPublicId(value.publicId ?? "", "conn"),
    kind: value.kind,
    priority: value.priority,
    provider: value.provider,
    status: value.status,
  };
}
