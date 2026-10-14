import {
  businessDomainCandidateKey,
  normalizeGoogleMapsUrl,
  opaqueBusinessIdentifier,
} from "@/lib/business-locations/identity-normalization";
import { hasAsciiControlCharacters } from "@/lib/validation/control-characters";
import { z } from "zod";
import type {
  CreateLocationCommand,
  IdentitySummary,
  LocationSummary,
  ReviseLocationCommand,
} from "./contracts";

export const identityFieldNames = [
  "name",
  "address",
  "domain",
  "cid",
  "placeId",
  "mapsUrl",
  "latitude",
  "longitude",
  "reason",
] as const;
export type IdentityField = (typeof identityFieldNames)[number];
const decimal = (value: string) =>
  /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(Number(value));
export const identityFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "validation.name")
      .max(200, "validation.name")
      .refine(
        (value) => Boolean(value.trim()) && !hasAsciiControlCharacters(value),
        "validation.name",
      ),
    address: z.string().max(500, "validation.address"),
    domain: z
      .string()
      .max(253, "validation.domain")
      .refine((value) => !value || businessDomainCandidateKey(value) !== null, "validation.domain"),
    cid: z
      .string()
      .refine((value) => !value || opaqueBusinessIdentifier(value, "cid").ok, "validation.cid"),
    placeId: z
      .string()
      .refine(
        (value) => !value || opaqueBusinessIdentifier(value, "place_id").ok,
        "validation.placeId",
      ),
    mapsUrl: z
      .string()
      .max(4096, "validation.mapsUrl")
      .refine((value) => !value || normalizeGoogleMapsUrl(value) !== null, "validation.mapsUrl"),
    latitude: z.string(),
    longitude: z.string(),
    reason: z.string().trim().min(1, "validation.reason").max(500, "validation.reason"),
    role: z.enum(["subject", "competitor"]),
  })
  .strict()
  .superRefine((values, context) => {
    if (!values.latitude && !values.longitude) return;
    for (const field of ["latitude", "longitude"] as const) {
      const limit = field === "latitude" ? 90 : 180;
      if (!decimal(values[field]) || Math.abs(Number(values[field])) > limit)
        context.addIssue({ code: "custom", path: [field], message: "validation.coordinates" });
    }
  });
export type IdentityFormValues = z.infer<typeof identityFormSchema>;
export function identityDefaults(
  identity?: IdentitySummary | null,
  role: IdentityFormValues["role"] = "subject",
): IdentityFormValues {
  return {
    name: identity?.name ?? "",
    address: identity?.address ?? "",
    domain: identity?.domain ?? "",
    cid: identity?.identifiers.find((id) => id.type === "cid")?.value ?? "",
    placeId: identity?.identifiers.find((id) => id.type === "place_id")?.value ?? "",
    mapsUrl: identity?.mapsUrl ?? "",
    latitude: identity?.coordinates ? String(identity.coordinates.latitude) : "",
    longitude: identity?.coordinates ? String(identity.coordinates.longitude) : "",
    reason: "",
    role,
  };
}
export function identityInput(values: IdentityFormValues): CreateLocationCommand["identity"] {
  const parsed = identityFormSchema.parse(values);
  return {
    name: parsed.name,
    address: parsed.address || null,
    domain: parsed.domain || null,
    mapsUrl: parsed.mapsUrl ? normalizeGoogleMapsUrl(parsed.mapsUrl) : null,
    coordinates: parsed.latitude
      ? { latitude: Number(parsed.latitude), longitude: Number(parsed.longitude) }
      : null,
    identifiers: (["cid", "place_id"] as const).flatMap((type) => {
      const value = type === "cid" ? parsed.cid : parsed.placeId;
      return value
        ? [{ namespace: "google_business" as const, engine: "google" as const, type, value }]
        : [];
    }),
  };
}
/** Only changed fields become a revision patch; untouched optional metadata/provenance survives. */
export function identityPatch(
  values: IdentityFormValues,
  current: IdentitySummary,
): ReviseLocationCommand["patch"] | null {
  const defaults = identityDefaults(current, values.role);
  const input = identityInput(values);
  const patch: ReviseLocationCommand["patch"] = {};
  for (const key of ["name", "address", "domain", "mapsUrl"] as const) {
    if (values[key] !== defaults[key]) Object.assign(patch, { [key]: input[key] });
  }
  if (values.latitude !== defaults.latitude || values.longitude !== defaults.longitude)
    patch.coordinates = input.coordinates;
  if (values.cid !== defaults.cid || values.placeId !== defaults.placeId)
    patch.identifiers = input.identifiers;
  return Object.keys(patch).length ? patch : null;
}
/** Explicitly reviewed rebase: preserve changed field groups, refresh untouched optional data. */
export function reviewedIdentityDraft(
  values: IdentityFormValues,
  previous: IdentitySummary,
  latest: LocationSummary,
): IdentityFormValues {
  const old = identityDefaults(previous, values.role);
  const next = identityDefaults(latest.identity, latest.role);
  for (const field of ["name", "address", "domain", "mapsUrl"] as const)
    if (values[field] !== old[field]) next[field] = values[field];
  if (values.cid !== old.cid || values.placeId !== old.placeId) {
    next.cid = values.cid;
    next.placeId = values.placeId;
  }
  if (values.latitude !== old.latitude || values.longitude !== old.longitude) {
    next.latitude = values.latitude;
    next.longitude = values.longitude;
  }
  next.reason = values.reason;
  return next;
}
