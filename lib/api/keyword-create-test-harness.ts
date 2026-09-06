import { createKeywords } from "./keyword-create";

type DefaultMarket = {
  city?: string | null;
  country?: string | null;
  device?: "desktop" | "mobile" | null;
  locationKey?: string | null;
};

type CreatedKeyword = {
  device: "desktop" | "mobile";
  location: string;
  locationId: string;
  projectId: string;
  publicId: string;
  text: string;
};

/** Exercises the REST creation path and retains the row supplied to createMany. */
export async function createKeywordAfterDefault(defaults: DefaultMarket) {
  const createdRows: CreatedKeyword[] = [];
  const project = {
    id: "project_1",
    publicId: "prj_a00000000000000000000000",
  };
  const client = {
    $executeRaw: async () => 0,
    $queryRaw: async () => [],
    auditLog: { create: async () => ({}) },
    keyword: {
      count: async () => 0,
      createMany: async ({ data }: { data: CreatedKeyword[] }) => {
        createdRows.push(...data);
        return { count: data.length };
      },
      findMany: async (args: { include?: unknown; where?: { publicId?: { in: string[] } } }) => {
        const stored = createdRows.map((row, index) => ({
          ...row,
          archivedAt: null,
          createdAt: new Date("2026-09-05T00:00:00.000Z"),
          id: `keyword_${index + 1}`,
          intent: null,
          locationRef: { canonicalKey: "DE", languageCode: "de", languageLabel: "German" },
          project: { defaults: null },
          rankChecks: [],
          schedule: null,
          tags: [],
          targetUrl: null,
          topic: null,
          updatedAt: new Date("2026-09-05T00:00:00.000Z"),
        }));
        if (args.include) return stored;
        return args.where?.publicId ? stored : [];
      },
    },
    keywordSchedule: { createMany: async () => ({ count: 0 }) },
    keywordTag: { createMany: async () => ({ count: 0 }) },
    projectDefaults: { findUnique: async () => defaults },
    projectMarket: {
      findMany: async () => [],
      upsert: async () => ({ publicId: "pmkt_a00000000000000000000000" }),
    },
    tag: {
      createMany: async () => ({ count: 0 }),
      findMany: async () => [],
    },
  };
  const req = new Request(
    "https://example.com/api/v1/projects/prj_a00000000000000000000000/keywords",
    {
      body: JSON.stringify({ keyword: "after default change" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  const response = await createKeywords(
    {
      auth: { apiKey: { projectId: project.id }, project },
      headers: new Headers(),
      instance: "urn:bisibility:test",
      method: "POST",
      path: ["projects", project.publicId, "keywords"],
      req,
      url: new URL(req.url),
    } as never,
    project.publicId,
    client as never,
  );

  return { createdRows, response };
}
