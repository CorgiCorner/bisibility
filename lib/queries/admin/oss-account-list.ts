import "server-only";
import { prisma } from "@/lib/db/prisma";
import { databaseSchemaFromUrl } from "@/lib/db/schema-config.mjs";
import { Prisma } from "@/lib/generated/prisma/client";
import { type AccountListInput, accountListInput } from "@/lib/instance-admin/account-list-input";
import type { AdminAccountView } from "@/lib/ops/admin-account-view";

export { type AccountListInput, accountListInput } from "@/lib/instance-admin/account-list-input";

type Row = {
  id: string;
  email: string;
  deactivatedAt: Date | null;
  createdAt: Date;
  lastActive: Date | null;
  projects: bigint;
};

const facts = Prisma.sql`
  LEFT JOIN LATERAL (SELECT MAX(s."updatedAt") AS "lastActive" FROM sessions s WHERE s."userId"=u.id) activity ON TRUE
  LEFT JOIN LATERAL (SELECT count(*) AS projects FROM (
    SELECT p.id FROM projects p WHERE p."ownerId"=u.id
    UNION SELECT m."projectId" FROM memberships m WHERE m."userId"=u.id
  ) accessible) scope ON TRUE`;
const sorts = {
  email: Prisma.sql`lower(u.email)`,
  status: Prisma.sql`(u."deactivatedAt" IS NOT NULL)`,
  created: Prisma.sql`u."createdAt"`,
  lastActive: Prisma.sql`activity."lastActive"`,
  projects: Prisma.sql`scope.projects`,
};

/** Prefix search and bounded rows; aggregate sorts remain exact over all matching accounts. */
export async function readAccountList(input: AccountListInput) {
  const options = accountListInput.parse(input);
  const prefix = `${options.search.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
  const where = options.search
    ? Prisma.sql`WHERE lower(u.email) LIKE ${prefix} OR lower(u."publicId") LIKE ${prefix}`
    : Prisma.empty;
  const direction = options.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const order = Prisma.sql`${sorts[options.sort]} ${direction} NULLS LAST, u."publicId" ASC`;
  const limit = Prisma.sql`LIMIT ${options.pageSize} OFFSET ${(options.page - 1) * options.pageSize}`;
  const aggregateSort = options.sort === "projects" || options.sort === "lastActive";
  const query = aggregateSort
    ? Prisma.sql`SELECT u."publicId" AS id,u.email,u."deactivatedAt",u."createdAt",activity."lastActive",scope.projects
        FROM users u ${facts} ${where} ORDER BY ${order} ${limit}`
    : Prisma.sql`SELECT u."publicId" AS id,u.email,u."deactivatedAt",u."createdAt",activity."lastActive",scope.projects
        FROM (SELECT u.* FROM users u ${where} ORDER BY ${order} ${limit}) u
        ${facts} ORDER BY ${order}`;
  return prisma.$transaction(
    async (tx) => {
      const schema = databaseSchemaFromUrl(process.env.DATABASE_URL ?? "") ?? "public";
      // Raw SQL must resolve the same schema as Prisma, including isolated CI schemas.
      await tx.$queryRaw`SELECT set_config('search_path', ${`"${schema}",pg_temp`}, true)`;
      const [counts] = await tx.$queryRaw<{ total: bigint; filtered: bigint }[]>(Prisma.sql`
      SELECT (SELECT count(*) FROM users) AS total, (SELECT count(*) FROM users u ${where}) AS filtered`);
      const rows = await tx.$queryRaw<Row[]>(query);
      const accounts: AdminAccountView[] = rows.map((row) => ({
        id: row.id,
        email: row.email,
        status: row.deactivatedAt ? "deactivated" : "active",
        created: row.createdAt.toISOString(),
        lastActive: row.lastActive?.toISOString() ?? "-",
        projects: Number(row.projects),
        keywords: null,
        connections: "-",
      }));
      return {
        account: null,
        accounts,
        accountTotalCount: Number(counts.total),
        filteredCount: Number(counts.filtered),
        page: options.page,
        pageSize: options.pageSize,
        pageCount: Math.ceil(Number(counts.filtered) / options.pageSize),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
