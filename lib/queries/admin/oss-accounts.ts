import "server-only";
import { createHash } from "node:crypto";
import { consume } from "@/lib/api/ratelimit";
import { writeAudit } from "@/lib/auth/audit";
import type { AdminAccountView } from "@/lib/ops/admin-account-view";
import { loadInstanceAccountFacts } from "@/lib/queries/instance-admin-account-facts";
import { z } from "zod";
import { ossAdminSession } from "./oss-access";
import { type AccountListInput, readAccountList } from "./oss-account-list";

export async function getOssAccounts(input: AccountListInput = {}) {
  const session = await ossAdminSession();
  if (!session) return null;
  return {
    ...(await readAccountList(input)),
    twoFactorEnabled: session.user.twoFactorEnabled === true,
  };
}

/** Detail reads retain the existing lookup budget and append-only account-view audit. */
export async function getOssAccount(input: unknown) {
  const session = await ossAdminSession();
  if (!session) return null;
  const parsed = z.string().trim().min(1).max(320).safeParse(input);
  if (!parsed.success) throw new Error("Enter an exact email address or user ID.");
  const identifier = parsed.data.includes("@") ? parsed.data.toLowerCase() : parsed.data;
  const hashed = `sha256:${createHash("sha256").update(identifier).digest("hex")}`;
  const audit = (result: "found" | "not_found" | "rate_limited" | "failed", target = hashed) =>
    writeAudit({
      action: "instance_admin.account_viewed",
      actorId: session.user.id,
      projectId: null,
      after: { result },
      targetId: target,
      targetType: result === "found" ? "user" : "instance_ops",
      ...(result === "found"
        ? {}
        : { status: "failed" as const, statusReason: `Account lookup ${result}.` }),
    });
  let facts: Awaited<ReturnType<typeof loadInstanceAccountFacts>>;
  try {
    const limit = await consume({
      bucketKey: session.user.id,
      limit: 10,
      prefix: "bisibility:instance-admin:account-lookup",
      windowSeconds: 60,
    });
    if (!limit.success) {
      await audit("rate_limited");
      return {
        account: null,
        status: "rate_limited" as const,
        retryAt: new Date(limit.resetAt).toISOString(),
      };
    }
    facts = await loadInstanceAccountFacts(identifier);
  } catch {
    await audit("failed");
    return { account: null, status: "failed" as const };
  }
  if (!facts) {
    await audit("not_found");
    return { account: null, status: "not_found" as const };
  }
  await audit("found", facts.id);
  const account: AdminAccountView = {
    id: facts.id,
    email: facts.email,
    status: facts.status,
    created: facts.createdAt,
    lastActive: facts.lastActiveAt ?? "-",
    projects: facts.projectCount,
    keywords: facts.keywordCount,
    connections:
      facts.providerConnectionsByKind.map((group) => `${group.kind}: ${group.count}`).join(", ") ||
      "-",
  };
  return { account, status: "found" as const };
}
