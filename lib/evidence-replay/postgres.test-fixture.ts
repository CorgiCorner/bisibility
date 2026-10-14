import { randomUUID } from "node:crypto";
import {
  type BusinessPgFixture,
  seedBusinessProject,
} from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { ReplayAuthority } from "./model";
export async function seedReplayProject(fixture: BusinessPgFixture, count = 2) {
  const { project, writer } = await seedBusinessProject(fixture);
  const location = await fixture.db.location.create({
    data: {
      canonicalKey: randomUUID(),
      kind: "city",
      displayName: "Synthetic",
      countryCode: "PL",
      gl: "pl",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "Synthetic",
      secondaryGeoName: "Synthetic",
    },
  });
  const keyword = await fixture.db.keyword.create({
    data: {
      projectId: project.id,
      publicId: makePublicId("kw"),
      text: "synthetic history",
      location: "Synthetic",
      locationId: location.id,
    },
  });
  const checks = [];
  for (let i = 0; i < count; i++)
    checks.push(
      await fixture.db.rankCheck.create({
        data: {
          keywordId: keyword.id,
          publicId: makePublicId("check"),
          provider: "dataforseo",
          status: "completed",
          requestedDepth: 100,
          normalizationVersion: "original-v1",
          checkedAt: new Date(`2026-10-10T12:00:0${i}.123Z`),
          raw: {
            organic_results: [{ domain: `source${i}.test`, rank: 9 - i }],
            snapshotExtension: {
              pages: [{ organic_results: [{ domain: "later.test", rank: 1 }] }],
            },
          },
        },
      }),
    );
  const authority: ReplayAuthority = {
    kind: "session",
    actor: { id: writer.id, memberships: [] },
  };
  const request = {
    projectId: project.publicId,
    from: "2026-10-01T00:00:00.000Z",
    to: new Date().toISOString(),
    maxRows: 100,
    batchSize: 1,
  };
  return { project, writer, keyword, checks, authority, request };
}

/** A real SQL failure after projection UPDATE must roll the whole service transaction back. */
export function rejectReceiptDatabase(fixture: BusinessPgFixture) {
  return {
    query: async (sql: string, values?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO history_evidence_replay_receipts"))
        return fixture.client.query("SELECT 1/0");
      return fixture.client.query(sql, values ? [...values] : []);
    },
  };
}

export async function originalCheckSnapshot(fixture: BusinessPgFixture, keywordId: string) {
  return (
    await fixture.client.query(
      'SELECT id,raw,"checkedAt"::text AS checked,"createdAt"::text AS created,"updatedAt"::text AS updated,position,"costCents" FROM rank_checks WHERE "keywordId"=$1 ORDER BY id',
      [keywordId],
    )
  ).rows;
}
