import { prisma } from "@/lib/db/prisma";
import { handleApiRequest } from "@/lib/api/router";
import { hashApiKey } from "@/lib/providers/crypto";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const projectPublicId = "prj_a00000000000000000000003";
const rawKey = "bsb_key_test_throughput_rest_0001";

function request(items: Array<{ keyword: string }>) {
  const path = `/projects/${projectPublicId}/keywords`;
  return {
    path: path.split("/").filter(Boolean),
    request: new Request(`http://127.0.0.1/api/v1${path}`, {
      body: JSON.stringify(items),
      headers: {
        authorization: `Bearer ${rawKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    }),
  };
}

async function postKeywords(items: Array<{ keyword: string }>) {
  const input = request(items);
  const startedAt = performance.now();
  const response = await handleApiRequest(input.request, input.path);
  if (!(response instanceof Response)) {
    throw new Error(
      `REST handler returned ${Object.prototype.toString.call(response)} with keys ${Object.keys(response ?? {}).join(",")}`,
    );
  }
  return {
    body: (await response.json()) as {
      created?: number;
      detail?: string;
      results?: Array<{ keyword: { text: string }; status: string }>;
      skipped?: number;
    },
    elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
    status: response.status,
  };
}

export async function restBatch(ownerId: string) {
  process.env.BISIBILITY_API_KEY_RATE_LIMIT_PER_MINUTE = "10000";
  process.env.BISIBILITY_MAX_KEYWORDS_PER_PROJECT = "500";
  process.env.REDIS_URL = "";
  const project = await prisma.project.create({
    data: {
      domain: "rest-batch.example",
      name: "REST batch",
      ownerId,
      publicId: projectPublicId,
      trackingScope: "country",
    },
  });
  await prisma.apiKey.create({
    data: {
      hashedKey: hashApiKey(rawKey),
      name: "REST harness",
      prefix: rawKey.slice(0, 21),
      projectId: project.id,
      publicId: "key_a00000000000000000000000",
      scopes: ["read", "write", "admin"],
    },
  });
  const items = Array.from({ length: 500 }, (_, index) => ({
    keyword: `rest keyword ${index.toString().padStart(3, "0")}`,
  }));
  const batch = await postKeywords(items);
  const count = await prisma.keyword.count({ where: { projectId: project.id } });
  assert(batch.status === 201, `500-item REST request returned ${batch.status}: ${batch.body.detail}`);
  assert(batch.body.created === 500, `500-item REST request created ${batch.body.created}`);
  assert(batch.body.skipped === 0, `500-item REST request skipped ${batch.body.skipped}`);
  assert(count === 500, `500-item REST request persisted ${count} keywords`);
  assert(batch.body.results?.length === 500, "500-item REST response lost result rows");
  assert(
    batch.body.results.every((result, index) => result.keyword.text === items[index]?.keyword),
    "500-item REST response changed input order",
  );

  process.env.BISIBILITY_MAX_KEYWORDS_PER_PROJECT = "501";
  const mixed = await postKeywords([
    { keyword: "rest keyword 000" },
    { keyword: "rest keyword 500" },
  ]);
  assert(mixed.status === 201, `mixed REST request returned ${mixed.status}`);
  assert(mixed.body.created === 1 && mixed.body.skipped === 1, "mixed REST counts were unstable");
  const beforeRollback = await prisma.keyword.count({ where: { projectId: project.id } });
  const rejected = await postKeywords([
    { keyword: "rest keyword 000" },
    { keyword: "rest keyword 501" },
    { keyword: "rest keyword 502" },
  ]);
  const afterRollback = await prisma.keyword.count({ where: { projectId: project.id } });
  assert(rejected.status === 403, `over-cap mixed REST request returned ${rejected.status}`);
  assert(beforeRollback === 501 && afterRollback === 501, "over-cap REST request was not atomic");

  return {
    count,
    elapsedMs: batch.elapsedMs,
    mixed: {
      created: mixed.body.created,
      elapsedMs: mixed.elapsedMs,
      skipped: mixed.body.skipped,
    },
    rollback: { after: afterRollback, before: beforeRollback, status: rejected.status },
  };
}
