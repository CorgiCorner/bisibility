import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { pacificDay } from "@/lib/providers/pacific-reset";
import { effectiveInspectionMode } from "./budget-mode";
import { DEFAULT_INSPECTION_DAILY_LIMIT } from "./constants";

export const inspectionDay = pacificDay;

export class InspectionAllowanceExpiredError extends Error {
  constructor() {
    super("The Pacific inspection day changed. Retry with a new daily reservation.");
  }
}

export function assertInspectionReservationCurrent(dayEnd: Date | undefined, now = new Date()) {
  if (dayEnd && now >= dayEnd) throw new InspectionAllowanceExpiredError();
}

// Manual and background inspections reserve one project allowance before Google calls.
// Every URL sent counts, even on failure; batches release admitted but unsent URLs.
// The application allowance and the property counter both use Pacific calendar days.
function auditCount(data: Prisma.JsonValue, field: string) {
  const value = data && typeof data === "object" && !Array.isArray(data) ? data[field] : undefined;
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`Inspection ${field} count is invalid.`);
  return value;
}

export async function getInspectionBudget(
  projectId: string,
  now: Date,
  db: Prisma.TransactionClient = prisma,
) {
  const day = inspectionDay(now);
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      publicId: true,
      defaults: { select: { inspectionDailyLimit: true, inspectionBudgetMode: true } },
    },
  });
  const requests = await db.auditLog.findMany({
    where: { projectId, action: "search_index.inspect", createdAt: day },
    select: { after: true },
  });
  const used = requests.reduce((total, row) => {
    for (const field of ["requested", "refused", "repeats"]) auditCount(row.after, field);
    const reservationAt =
      row.after && typeof row.after === "object" && !Array.isArray(row.after)
        ? row.after.reservationAt
        : null;
    const released =
      typeof reservationAt === "string" &&
      (new Date(reservationAt) < day.gte || new Date(reservationAt) >= day.lt)
        ? 0
        : auditCount(row.after, "released");
    return total + auditCount(row.after, "admitted") - released;
  }, 0);
  const mode = effectiveInspectionMode(project.defaults?.inspectionBudgetMode);
  const limit =
    mode === "available_quota"
      ? Number.MAX_SAFE_INTEGER
      : (project.defaults?.inspectionDailyLimit ?? DEFAULT_INSPECTION_DAILY_LIMIT);
  return { day, limit, used, remaining: Math.max(0, limit - used), publicId: project.publicId };
}

export async function reserveInspections(input: {
  actorId?: string | null;
  projectId: string;
  urls: string[];
  now?: Date;
  repeatsFrom?: Array<{ url: string; checkedAt: Date | null }>;
  skipEmpty?: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inspection-budget:${input.projectId}`}))`;
    const [clock] = input.now
      ? [{ now: input.now }]
      : await tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
    const budget = await getInspectionBudget(input.projectId, clock.now, tx);
    const admitted = input.urls.slice(0, budget.remaining);
    const previous = await tx.urlPresence.findMany({
      where: { projectId: input.projectId, url: { in: admitted } },
    });
    const repeated = (input.repeatsFrom ?? previous).filter(
      (row) =>
        admitted.includes(row.url) &&
        row.checkedAt !== null &&
        row.checkedAt >= budget.day.gte &&
        row.checkedAt < budget.day.lt,
    );
    const counts = {
      requested: input.urls.length,
      admitted: admitted.length,
      refused: input.urls.length - admitted.length,
      repeats: repeated.length,
    };
    const audit =
      input.skipEmpty && !admitted.length
        ? null
        : await writeAudit(
            {
              action: "search_index.inspect",
              actorId: input.actorId ?? null,
              projectId: input.projectId,
              targetId: budget.publicId,
              targetType: "project",
              after: counts,
            },
            tx,
          );
    return {
      admitted,
      reservationAt: clock.now,
      dayEnd: budget.day.lt,
      previous,
      targetId: budget.publicId,
      repeated: repeated.map((row) => row.url),
      counts,
      audit,
    };
  });
}

export async function releaseInspections(input: {
  actorId?: string | null;
  projectId: string;
  targetId: string;
  released: number;
  reservationAt?: Date;
}) {
  if (!input.released) return;
  await writeAudit({
    action: "search_index.inspect",
    actorId: input.actorId ?? null,
    projectId: input.projectId,
    targetId: input.targetId,
    targetType: "project",
    after: {
      released: input.released,
      ...(input.reservationAt ? { reservationAt: input.reservationAt.toISOString() } : {}),
    },
  });
}
