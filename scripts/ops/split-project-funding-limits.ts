import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { databasePoolConfig, databaseSchemaFromUrl } from "../../lib/db/pool-config";
import { PrismaClient } from "../../lib/generated/prisma/client";
import {
  type ProjectFundingSplit,
  splitProjectFundingLimits,
} from "../../lib/metering/project-funding-split";
import { meteringNamespace } from "../../lib/metering/runtime";

class DryRun extends Error {
  constructor(readonly result: ProjectFundingSplit) {
    super("dry run");
  }
}

/**
 * Give each project separate Credits and your-key limits. Every web and worker instance must
 * already tag paid attempts with the project funding source; older writers would bypass the
 * new limits. Each project commits on its own, so a rerun continues where a failure stopped.
 */
export async function splitAllProjectFundingLimits(
  databaseUrl: string,
  options: { dryRun: boolean; projectId?: string },
) {
  const schema = databaseSchemaFromUrl(databaseUrl) ?? "public";
  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString: databaseUrl,
        ...databasePoolConfig(
          { DATABASE_POOL_MAX: "1", DATABASE_APPLICATION_NAME: "bisibility-funding-split" },
          databaseUrl,
        ),
      },
      { schema },
    ),
  });
  const namespace = meteringNamespace();
  const results: ProjectFundingSplit[] = [];
  try {
    const projects = await prisma.project.findMany({
      select: { id: true },
      where: options.projectId ? { id: options.projectId } : {},
      orderBy: { id: "asc" },
    });
    if (options.projectId && !projects.length) throw new Error("Project not found");
    for (const project of projects) {
      const now = new Date();
      try {
        results.push(
          await prisma.$transaction(
            async (tx) => {
              const result = await splitProjectFundingLimits(tx, namespace, project.id, now);
              if (options.dryRun) throw new DryRun(result);
              return result;
            },
            // Each project may hydrate historical operations before splitting its budgets.
            { maxWait: 10_000, timeout: 120_000 },
          ),
        );
      } catch (error) {
        if (!(error instanceof DryRun)) throw error;
        results.push(error.result);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  return {
    status: "PASS",
    schema,
    namespace,
    dryRun: options.dryRun,
    split: results.filter((r) => r.outcome === "split").length,
    alreadySplit: results.filter((r) => r.outcome === "already_split").length,
    results,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({
      options: {
        "old-writers-drained": { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
        project: { type: "string" },
      },
    });
    if (!values["dry-run"] && !values["old-writers-drained"])
      throw new Error(
        "Run only after every web and worker instance tags project funding, then pass --old-writers-drained",
      );
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required to split project funding limits");
    console.log(
      JSON.stringify(
        await splitAllProjectFundingLimits(url, {
          dryRun: values["dry-run"],
          projectId: values.project,
        }),
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Project funding split failed");
    process.exitCode = 1;
  }
}
