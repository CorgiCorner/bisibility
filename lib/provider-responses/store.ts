import { getRankCheckRawRetentionDays } from "@/lib/rank-check/raw-retention-config";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import { redactProviderResponse } from "@/lib/providers/provider-response";

export type ResponseCaptureScope = {
  projectId: string;
  connectionId?: string;
  provider: string;
  feature: string;
  operationId?: string;
};
export type NativeResponse = { status: number; body: unknown; url?: string; attemptId?: string };
export async function storeProviderResponse(
  scope: ResponseCaptureScope,
  response: NativeResponse,
  db: Pick<PrismaClient, "providerResponseCapture"> = prisma,
) {
  const body = JSON.stringify(redactProviderResponse(response.body)) ?? "null";
  const capturedAt = new Date();
  const days = getRankCheckRawRetentionDays();
  await db.providerResponseCapture.create({
    data: {
      id: randomUUID(),
      ...scope,
      attemptId: response.attemptId,
      httpStatus: response.status,
      requestUrl: response.url ? String(redactProviderResponse(response.url)) : null,
      payloadEncrypted: encryptSecret(gzipSync(body).toString("base64")),
      payloadHash: createHash("sha256").update(body).digest("hex"),
      payloadBytes: Buffer.byteLength(body),
      capturedAt,
      expiresAt: days === null ? null : new Date(capturedAt.getTime() + days * 86_400_000),
    },
  });
}
export async function readProviderResponse(projectId: string, id: string) {
  const row = await prisma.providerResponseCapture.findFirst({
    where: { id, projectId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  });
  if (!row) return null;
  const body = gunzipSync(Buffer.from(decryptSecret(row.payloadEncrypted), "base64")).toString();
  return redactProviderResponse(JSON.parse(body));
}
export async function pruneProviderResponses(now = new Date()) {
  const rows = await prisma.providerResponseCapture.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    take: 1000,
  });
  return prisma.providerResponseCapture.deleteMany({
    where: { id: { in: rows.map((row) => row.id) }, expiresAt: { lte: now } },
  });
}
