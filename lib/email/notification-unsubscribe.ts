import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { readOnlyDemoConfig } from "@/lib/demo/config";
import { escapeHtml } from "@/lib/email/escape-html";
import { oneClickOrigin } from "@/lib/email/one-click-link";
import { Prisma } from "@/lib/generated/prisma/client";
import { getPurposeSecretKeys } from "@/lib/providers/crypto";

const PURPOSE = "notification-email-unsubscribe";
const LIFETIME_MS = 730 * 24 * 60 * 60 * 1000;
type Scope = { userId: string; projectId: string; stream: "alert" | "report" };

export function createNotificationUnsubscribeToken(scope: Scope, now = new Date()) {
  const key = getPurposeSecretKeys(PURPOSE)[0];
  if (!key) throw new Error("Email signing is unavailable.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const payload = Buffer.from(JSON.stringify({ ...scope, expiresAt: now.getTime() + LIFETIME_MS }));
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function readToken(token: string, now: Date): Scope | null {
  if (!token || token.length > 2000) return null;
  const value = Buffer.from(token, "base64url");
  if (value.length <= 28 || value.toString("base64url") !== token) return null;
  for (const key of getPurposeSecretKeys(PURPOSE)) {
    try {
      const cipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12), {
        authTagLength: 16,
      });
      cipher.setAuthTag(value.subarray(12, 28));
      const payload: unknown = JSON.parse(
        Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString("utf8"),
      );
      if (!payload || typeof payload !== "object") continue;
      const data = payload as Record<string, unknown>;
      if (
        typeof data.userId === "string" &&
        data.userId.length > 0 &&
        data.userId.length <= 200 &&
        typeof data.projectId === "string" &&
        data.projectId.length > 0 &&
        data.projectId.length <= 200 &&
        (data.stream === "alert" || data.stream === "report") &&
        typeof data.expiresAt === "number" &&
        data.expiresAt > now.getTime()
      )
        return { userId: data.userId, projectId: data.projectId, stream: data.stream };
    } catch {}
  }
  return null;
}

export function verifyNotificationUnsubscribeToken(token: string) {
  return readToken(token, new Date()) !== null;
}

export async function unsubscribeNotificationEmail(token: string) {
  // Editable demo mail ships normally, so its unsubscribe must work; the legacy snapshot sends none.
  if (readOnlyDemoConfig()) return false;
  const scope = readToken(token, new Date());
  if (!scope) return false;
  const data = scope.stream === "alert" ? { alertEmail: false } : { reportEmail: false };
  try {
    await prisma.notificationPreference.upsert({
      where: { userId_projectId: { userId: scope.userId, projectId: scope.projectId } },
      create: { userId: scope.userId, projectId: scope.projectId, ...data },
      update: data,
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")) {
      throw error;
    }
  }
  return true;
}

export function notificationUnsubscribeUrl(scope: Scope, origin: string) {
  const url = new URL("/api/email/unsubscribe/one-click", oneClickOrigin(origin));
  url.searchParams.set("stream", "notification");
  url.searchParams.set("token", createNotificationUnsubscribeToken(scope));
  return url.toString();
}

export function notificationUnsubscribeFooter(email: { html: string; text: string }, url: string) {
  const confirmation = new URL(url);
  confirmation.pathname = "/email/unsubscribe/notifications";
  confirmation.searchParams.delete("stream");
  return {
    html: `${email.html}<p><a href="${escapeHtml(confirmation.toString())}">Unsubscribe</a></p>`,
    text: `${email.text}\n\nUnsubscribe: ${confirmation.toString()}`,
  };
}
