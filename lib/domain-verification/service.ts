import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { type Actor, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import { checkDnsProof } from "./dns-check";
import { domainVerificationEnabled } from "./feature";
import {
  domainApex,
  domainHost,
  hasRecentVerification,
  newVerificationToken,
  nextVerificationState,
  verificationInputSchema,
} from "./model";
import { checkSearchConsoleProof } from "./search-console-proof";

export class DomainVerificationNotStartedError extends Error {
  constructor() {
    super("Start domain verification first.");
  }
}

export class DomainVerificationDisabledError extends Error {
  constructor() {
    super("Domain verification is disabled.");
  }
}

export async function requireVerificationEnabled() {
  if (!(await domainVerificationEnabled())) throw new DomainVerificationDisabledError();
}

async function readVerificationContext(projectId: string, actor: Actor) {
  authorize(actor, "update", { type: "project", projectId, requiredRole: "admin" });
  await requireVerificationEnabled();
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { domain: true },
  });
  if (!project.domain) return null;
  let domain: string;
  try {
    domain = domainApex(project.domain);
  } catch {
    return null;
  }
  const row = await prisma.projectDomainVerification.findUnique({
    where: { projectId_domain: { projectId, domain } },
  });
  return { row, host: domainHost(project.domain) };
}

function verificationForHost({
  row,
  host,
}: NonNullable<Awaited<ReturnType<typeof readVerificationContext>>>) {
  if (
    row?.verifiedAt &&
    (!hasRecentVerification(row) ||
      (row.proofScope !== "domain" && row.proofScope !== `host:${host}`))
  )
    return { ...row, verifiedAt: null };
  return row;
}

export async function readDomainVerification(projectId: string, actor: Actor) {
  const context = await readVerificationContext(projectId, actor);
  return context ? verificationForHost(context) : null;
}

export async function issueDomainVerification(
  projectId: string,
  actor: Actor,
  input: unknown,
  auditActorId: string | null = actor.id,
) {
  authorize(actor, "update", { type: "project", projectId, requiredRole: "admin" });
  await requireVerificationEnabled();
  const { method } = verificationInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const domain = domainApex(requireTrackedDomain(project));
    const now = new Date();
    const data = {
      method,
      token: newVerificationToken(),
      issuedAt: now,
      verifiedAt: null,
      lastCheckedAt: null,
      lastCheckResult: null,
      proofScope: null,
      failures: 0,
      revokedAt: null,
      noticeSentAt: null,
      nextCheckAt: now,
    };
    const row = await tx.projectDomainVerification.upsert({
      where: { projectId_domain: { projectId, domain } },
      create: { ...data, projectId, domain },
      update: { ...data, revision: { increment: 1 } },
    });
    await writeAudit(
      {
        actorId: auditActorId,
        projectId,
        action: "project.update",
        targetType: "project",
        targetId: project.publicId,
        after: { domain },
      },
      tx,
    );
    return row;
  });
}

export async function checkStoredVerification(
  row: Awaited<ReturnType<typeof issueDomainVerification>>,
  now = new Date(),
  readers = { dns: checkDnsProof, search: checkSearchConsoleProof },
  audit: { actorId: string | null; source: "manual" | "scheduled"; apiKeyId?: string } = {
    actorId: null,
    source: "scheduled",
  },
) {
  const proof =
    row.method === "dns_txt"
      ? { result: await readers.dns(row.domain, row.token), scope: "domain" as const }
      : await readers.search(row.projectId, row.domain);
  const { result } = proof;
  const state = nextVerificationState(row, result === "verified", now);
  const revoked = Boolean(row.verifiedAt && !state.verifiedAt);
  const granted =
    result === "verified" && (!hasRecentVerification(row, now) || row.proofScope !== proof.scope);
  const pending = now.getTime() - row.issuedAt.getTime() < 24 * 60 * 60 * 1000;
  const nextCheckAt = state.verifiedAt
    ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
    : pending
      ? new Date(now.getTime() + 10 * 60 * 1000)
      : null;
  const data = {
    ...state,
    revision: { increment: 1 },
    lastCheckedAt: now,
    lastCheckResult: result,
    nextCheckAt,
    ...(revoked ? { revokedAt: now, noticeSentAt: null } : {}),
    ...(result === "verified"
      ? { revokedAt: null, noticeSentAt: null, proofScope: proof.scope }
      : {}),
  };
  return prisma.$transaction(async (tx) => {
    const updated = await tx.projectDomainVerification.updateMany({
      where: { id: row.id, revision: row.revision },
      data,
    });
    if (updated.count === 1 && (granted || revoked)) {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: row.projectId },
        select: { publicId: true },
      });
      const snapshot = (value: typeof row) => ({
        domain: value.domain,
        method: value.method,
        proofScope: value.proofScope,
        verifiedAt: value.verifiedAt,
        revokedAt: value.revokedAt,
        failures: value.failures,
      });
      await writeAudit(
        {
          actorId: audit.actorId,
          projectId: row.projectId,
          action: `project.domain_verification.${revoked ? "revoke" : "grant"}`,
          targetType: "project",
          targetId: project.publicId,
          before: snapshot(row),
          after: {
            ...snapshot({ ...row, ...data, revision: row.revision + 1 }),
            source: audit.source,
            apiKeyId: audit.apiKeyId,
          },
        },
        tx,
      );
    }
    return tx.projectDomainVerification.findUniqueOrThrow({ where: { id: row.id } });
  });
}

export async function checkDomainVerification(
  projectId: string,
  actor: Actor,
  auditActorId: string | null = actor.id,
  auditApiKeyId?: string,
) {
  const context = await readVerificationContext(projectId, actor);
  if (!context?.row) throw new DomainVerificationNotStartedError();
  const row = await checkStoredVerification(context.row, new Date(), undefined, {
    actorId: auditActorId,
    source: "manual",
    apiKeyId: auditApiKeyId,
  });
  return verificationForHost({ ...context, row });
}

export async function isProjectDomainVerified(projectId: string, host: string) {
  if (!(await domainVerificationEnabled())) return false;
  let domain: string;
  try {
    domain = domainApex(host);
  } catch {
    return false;
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { domain: true },
  });
  try {
    if (!project?.domain || domainApex(project.domain) !== domain) return false;
  } catch {
    return false;
  }
  const row = await prisma.projectDomainVerification.findUnique({
    where: { projectId_domain: { projectId, domain } },
  });
  const hostName = domainHost(host);
  return Boolean(
    row &&
      hasRecentVerification(row) &&
      (row.proofScope === "domain" || row.proofScope === `host:${hostName}`),
  );
}

export function verificationResource(row: Awaited<ReturnType<typeof readDomainVerification>>) {
  if (!row) return null;
  return {
    domain: row.domain,
    method: row.method,
    dns_host: `_bisibility.${row.domain}`,
    dns_value: `bisibility-site-verification=${row.token}`,
    verified_at: row.verifiedAt?.toISOString() ?? null,
    last_checked_at: row.lastCheckedAt?.toISOString() ?? null,
    last_check_result: row.lastCheckResult,
    failures: row.failures,
    revoked_at: row.revokedAt?.toISOString() ?? null,
  };
}
