import type { BusinessObservationItem, IdentityRevision, MatchEvaluation } from "./dto";
import { mapsBusinessMatcherVersion } from "./dto";
import {
  businessDomainCandidateKey,
  businessNameCandidateKey,
  opaqueBusinessIdentifier,
} from "./identity-normalization";

export function identifierKey(identifier: {
  namespace: string;
  engine: string;
  type: string;
  value: string;
}) {
  return JSON.stringify([
    identifier.namespace,
    identifier.engine,
    identifier.type,
    identifier.value,
  ]);
}

export function identifierTypeKey(identifier: { namespace: string; engine: string; type: string }) {
  return JSON.stringify([identifier.namespace, identifier.engine, identifier.type]);
}

export function observationIdentifiers(item: BusinessObservationItem) {
  const values: { namespace: string; engine: string; type: "cid" | "place_id"; value: string }[] =
    [];
  const byType = new Map<string, string>();
  for (const identifier of item.identifiers) {
    const parsed = opaqueBusinessIdentifier(identifier.value, identifier.type);
    if (!parsed.ok) return { values, anomaly: parsed.reason } as const;
    const key = identifierTypeKey(identifier);
    if (byType.has(key) && byType.get(key) !== parsed.value)
      return { values, anomaly: "contradictory_identifiers" } as const;
    byType.set(key, parsed.value);
    values.push({ ...identifier, value: parsed.value });
  }
  return { values, anomaly: null } as const;
}

export function strongEvidence(
  target: IdentityRevision,
  item: ReturnType<typeof observationIdentifiers>,
) {
  const configured = new Map(
    target.snapshot.identifiers.map((identifier) => [
      identifierTypeKey(identifier),
      identifier.value,
    ]),
  );
  const exact: ("cid" | "place_id")[] = [];
  let conflict = false;
  for (const identifier of item.values) {
    const value = configured.get(identifierTypeKey(identifier));
    if (value === undefined) continue;
    if (value === identifier.value) exact.push(identifier.type);
    else conflict = true;
  }
  return { exact: [...new Set(exact)], conflict };
}

export function weakEvidence(target: IdentityRevision, item: BusinessObservationItem) {
  const targetName = businessNameCandidateKey(target.snapshot.name),
    itemName = businessNameCandidateKey(item.name);
  const targetDomain = businessDomainCandidateKey(target.snapshot.domain ?? null),
    itemDomain = businessDomainCandidateKey(item.domain);
  const name = Boolean(targetName && targetName === itemName),
    domain = Boolean(targetDomain && targetDomain === itemDomain);
  if (name && domain)
    return { matchedBy: "name_and_domain", reason: "weak_name_and_domain" } as const;
  if (name) return { matchedBy: "name", reason: "weak_name" } as const;
  if (domain) return { matchedBy: "domain", reason: "weak_domain" } as const;
  return null;
}

export function validOrdinals(item: BusinessObservationItem) {
  return Object.entries(item.originalOrdinals)
    .filter(([key]) => key !== "scale")
    .map(([, value]) => value)
    .every(
      (value) =>
        value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0),
    );
}

export function localResult(item: BusinessObservationItem) {
  return (
    (item.surface === "web_serp" && item.resultKind === "local_pack") ||
    (item.surface === "maps" && item.resultKind === "map_listing") ||
    (item.surface === "local_finder" && item.resultKind === "listing")
  );
}

export function organicEligibility(
  result: Pick<
    MatchEvaluation,
    "status" | "promotion" | "localResult" | "originalOrdinals" | "matcherVersion"
  >,
) {
  const slot =
    result.matcherVersion === mapsBusinessMatcherVersion
      ? result.originalOrdinals.scale === "maps_organic"
        ? (result.originalOrdinals.group ?? null)
        : null
      : result.originalOrdinals.slot;
  const ordinalsValid = Object.entries(result.originalOrdinals)
    .filter(([key]) => key !== "scale")
    .map(([, value]) => value)
    .every(
      (value) =>
        value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0),
    );
  return (
    result.status === "confirmed" &&
    result.promotion === "organic" &&
    result.localResult &&
    ordinalsValid &&
    slot !== null
  );
}
