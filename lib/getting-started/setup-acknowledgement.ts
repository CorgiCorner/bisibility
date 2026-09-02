import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveAuthSecret } from "@/lib/auth/secret";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { cookies } from "next/headers";
import { cache } from "react";

export const SETUP_ACKNOWLEDGEMENT_COOKIE = "getting-started-ack";
const MAX_ACKNOWLEDGEMENTS = 40;

const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

export type SetupAcknowledgement = Readonly<{ projectRef: string; userId: string }>;

function signature(payload: string): string {
  return createHmac("sha256", resolveAuthSecret()).update(payload).digest("base64url");
}

function verifiedPayload(raw: string): string | null {
  const separator = raw.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = raw.slice(0, separator);
  const supplied = Buffer.from(raw.slice(separator + 1));
  const expected = Buffer.from(signature(payload));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
    ? payload
    : null;
}

export function parseSetupAcknowledgements(raw: string | undefined): SetupAcknowledgement[] {
  if (!raw) return [];
  try {
    const payload = verifiedPayload(raw);
    if (!payload) return [];
    const value: unknown = JSON.parse(decodeURIComponent(payload));
    if (!Array.isArray(value)) return [];
    return value
      .flatMap((entry) => {
        if (
          typeof entry === "object" &&
          entry !== null &&
          "projectRef" in entry &&
          "userId" in entry &&
          typeof entry.projectRef === "string" &&
          typeof entry.userId === "string" &&
          entry.userId.length <= 128 &&
          isPublicIdOfType(entry.projectRef, "prj")
        ) {
          return [{ projectRef: entry.projectRef, userId: entry.userId }];
        }
        return [];
      })
      .slice(-MAX_ACKNOWLEDGEMENTS);
  } catch {
    return [];
  }
}

export function serializeSetupAcknowledgements(entries: readonly SetupAcknowledgement[]): string {
  const bounded = entries.slice(-MAX_ACKNOWLEDGEMENTS);
  const payload = encodeURIComponent(JSON.stringify(bounded));
  return `${payload}.${signature(payload)}`;
}

export function isSetupAcknowledged(
  raw: string | undefined,
  userId: string,
  projectRef: string,
): boolean {
  return parseSetupAcknowledgements(raw).some(
    (entry) => entry.userId === userId && entry.projectRef === projectRef,
  );
}

export function isSetupAcknowledgedAt(value: Date | null | undefined): boolean {
  return value != null;
}

async function readMembershipAcknowledgement(
  userId: string,
  projectRef: string,
): Promise<Date | null> {
  if (!isPublicIdOfType(projectRef, "prj")) {
    return null;
  }

  const membership = await prisma.membership.findFirst({
    select: { setupAcknowledgedAt: true },
    where: { userId, project: { publicId: projectRef } },
  });

  return membership?.setupAcknowledgedAt ?? null;
}

export async function markSetupAcknowledged(userId: string, projectRef: string): Promise<void> {
  if (!isPublicIdOfType(projectRef, "prj")) {
    throw new Error("Project not found.");
  }

  const membership = await prisma.membership.findFirst({
    select: { id: true, setupAcknowledgedAt: true },
    where: { userId, project: { publicId: projectRef } },
  });

  if (!membership) {
    throw new Error("Project not found.");
  }

  if (membership.setupAcknowledgedAt) {
    return;
  }

  await prisma.membership.update({
    data: { setupAcknowledgedAt: new Date() },
    where: { id: membership.id },
  });
}

async function backfillLegacyCookieAcknowledgements(
  userId: string,
  cookieValue: string | undefined,
): Promise<void> {
  const entries = parseSetupAcknowledgements(cookieValue).filter(
    (entry) => entry.userId === userId,
  );
  for (const entry of entries) {
    await markSetupAcknowledged(userId, entry.projectRef);
  }
}

export const loadSetupAcknowledgedAt = perRequestCache(
  async (userId: string, projectRef: string): Promise<Date | null> => {
    const stored = await readMembershipAcknowledgement(userId, projectRef);
    if (stored) {
      return stored;
    }

    const cookieValue = (await cookies()).get(SETUP_ACKNOWLEDGEMENT_COOKIE)?.value;
    if (!isSetupAcknowledged(cookieValue, userId, projectRef)) {
      return null;
    }

    await backfillLegacyCookieAcknowledgements(userId, cookieValue);
    return (await readMembershipAcknowledgement(userId, projectRef)) ?? new Date();
  },
);
