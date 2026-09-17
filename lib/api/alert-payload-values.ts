import type { Prisma } from "@/lib/generated/prisma/client";

export function legacyRelativeTime(date: Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function legacyPositionText(position: number | null) {
  return position ? `#${position}` : "No rank";
}

export function legacyWebhookEndpointLabel(
  channel: string,
  endpoint: { description: string | null; url: string } | null,
) {
  if (channel !== "webhook") return null;
  return endpoint?.description?.trim() || endpoint?.url || "Deleted endpoint";
}

export function payloadString(payload: Prisma.JsonValue | null | undefined, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload[key as keyof typeof payload];
  return typeof value === "string" ? value : null;
}

export function payloadStrings(payload: Prisma.JsonValue | null | undefined, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload[key as keyof typeof payload];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : null;
}
