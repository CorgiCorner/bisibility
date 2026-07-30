import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { emitSignal } from "@/lib/signals/emit";
import { z } from "zod";
import type { ApiContext } from "./context";
import { notFound } from "./context";
import { decodeCursor, encodeCursor, parseLimit, splitPage } from "./pagination";
import { requireApiPublicId } from "./public-id";
import { listResponse, resourceResponse } from "./responses";
import { objectBody, parseApiInput, readJsonBody, scopedProject } from "./surface";

const payloadLimitBytes = 8 * 1024;
const signalTypePattern = /^[a-z_]+\.[a-z_]+$/;
const createSignalSources = ["deploy", "cms", "api"] as const;
const signalSources = [
  "rank_tracker",
  "search_analytics",
  "url_inspection",
  "sitemap",
  "deploy",
  "cms",
  "search_engine_status",
  "manual",
  "api",
] as const;

const payloadSchema = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  let size = 0;
  try {
    size = Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    ctx.addIssue({ code: "custom", message: "payload must be JSON serializable." });
    return;
  }
  if (size > payloadLimitBytes) {
    ctx.addIssue({
      code: "custom",
      message: "payload must serialize to 8KB or less.",
    });
  }
});

const createSignalSchema = z.object({
  happenedAt: z.iso
    .datetime()
    .optional()
    .transform((value) => (value ? new Date(value) : new Date())),
  keywordId: z.string().trim().min(1).max(160).optional(),
  payload: payloadSchema.optional(),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  source: z.enum(createSignalSources),
  type: z.string().trim().regex(signalTypePattern),
  url: z
    .url()
    .regex(/^https?:\/\//i, "url must use http or https.")
    .optional(),
});

type SignalRecord = {
  createdAt: Date;
  happenedAt: Date;
  id: string;
  keyword?: { publicId: string } | null;
  payload: Prisma.JsonValue | null;
  publicId: string;
  severity: string;
  source: string;
  type: string;
  url: string | null;
};

function dateParam(url: URL, name: "from" | "to") {
  const raw = url.searchParams.get(name);
  if (!raw) return null;
  return z.iso.datetime().parse(raw);
}

function signalResource(
  signal: SignalRecord,
  projectPublicId: string,
  keywordPublicId?: string | null,
) {
  return {
    created_at: signal.createdAt.toISOString(),
    happened_at: signal.happenedAt.toISOString(),
    id: requireApiPublicId(signal.publicId, "sig"),
    keyword_id:
      keywordPublicId || signal.keyword?.publicId
        ? requireApiPublicId(keywordPublicId ?? signal.keyword?.publicId ?? "", "kw")
        : null,
    payload: signal.payload ?? null,
    project_id: requireApiPublicId(projectPublicId, "prj"),
    public_id: requireApiPublicId(signal.publicId, "sig"),
    severity: signal.severity,
    source: signal.source,
    type: signal.type,
    url: signal.url,
  };
}

function listFilters(url: URL) {
  const source = url.searchParams.get("source");
  const type = url.searchParams.get("type");
  const from = dateParam(url, "from");
  const to = dateParam(url, "to");

  return {
    from: from ? new Date(from) : null,
    source: source ? z.enum(signalSources).parse(source) : null,
    to: to ? new Date(to) : null,
    type: type ? z.string().trim().min(1).max(160).parse(type) : null,
  };
}

function signalWhere(
  projectId: string,
  filters: ReturnType<typeof listFilters>,
  cursor: ReturnType<typeof decodeCursor>,
) {
  const and: Prisma.SignalWhereInput[] = [{ projectId }];
  if (filters.source) and.push({ source: filters.source });
  if (filters.type) and.push({ type: filters.type });
  if (filters.from || filters.to) {
    and.push({ happenedAt: { gte: filters.from ?? undefined, lte: filters.to ?? undefined } });
  }
  if (cursor) {
    const happenedAt = new Date(cursor.t);
    and.push({
      OR: [{ happenedAt: { lt: happenedAt } }, { happenedAt, publicId: { lt: cursor.public_id } }],
    });
  }

  return and.length === 1 ? and[0] : { AND: and };
}

async function keywordForProject(projectId: string, keywordId: string | undefined) {
  if (!keywordId) return null;
  return prisma.keyword.findFirst({
    select: { id: true, publicId: true },
    where: { projectId, publicId: keywordId },
  });
}

export async function createSignalForProject(ctx: ApiContext) {
  const body = await readJsonBody(ctx);
  const data = parseApiInput(createSignalSchema, objectBody(body));
  const keywordPublicId = data.keywordId ? requireApiPublicId(data.keywordId, "kw") : undefined;
  const keyword = await keywordForProject(ctx.auth.project.id, keywordPublicId);
  if (data.keywordId && !keyword) {
    return notFound(ctx, "Keyword not found.");
  }

  const signal = await emitSignal({
    createdById: null,
    happenedAt: data.happenedAt,
    keywordId: keyword?.id,
    payload: data.payload as Prisma.InputJsonValue | undefined,
    projectId: ctx.auth.project.id,
    severity: data.severity,
    source: data.source,
    type: data.type,
    url: data.url,
  });
  const resource = signalResource(signal, ctx.auth.project.publicId, keyword?.publicId);

  await writeAudit({
    action: "signal.ingested",
    actorId: null,
    after: resource,
    projectId: ctx.auth.project.id,
    targetId: signal.publicId,
    targetType: "signal",
  });

  return resourceResponse(resource, { headers: ctx.headers, status: 201 });
}

export async function listProjectSignals(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const limit = parseLimit(ctx.url, 50, 200);
  const cursor = decodeCursor(ctx.url.searchParams.get("cursor"), "sig");
  const filters = listFilters(ctx.url);
  const signals = await prisma.signal.findMany({
    orderBy: [{ happenedAt: "desc" }, { publicId: "desc" }],
    select: {
      createdAt: true,
      happenedAt: true,
      id: true,
      keyword: { select: { publicId: true } },
      payload: true,
      publicId: true,
      severity: true,
      source: true,
      type: true,
      url: true,
    },
    take: limit + 1,
    where: signalWhere(ctx.auth.project.id, filters, cursor),
  });
  const { nextCursor, page } = splitPage(signals, limit, (signal) =>
    encodeCursor({ publicId: signal.publicId, timestamp: signal.happenedAt }, "sig"),
  );

  return listResponse(
    page.map((signal) => signalResource(signal, ctx.auth.project.publicId)),
    nextCursor,
    { headers: ctx.headers },
  );
}
