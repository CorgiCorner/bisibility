import pg from "pg";
import { databaseConnectionConfig } from "../../lib/db/schema-config.mjs";

export const screenshotKeywords = [
  "seo api", "keyword research api", "rank tracking api", "self hosted seo platform",
  "seo mcp server", "seo webhooks", "python seo sdk", "search ranking alerts",
  "search visibility api", "google rank history", "seo agent tools", "backlink research api",
  "open source seo dashboard", "keyword grouping api", "local keyword rankings",
  "typescript seo sdk", "automated seo reports", "search console api integration",
  "serp monitoring api", "weekly ranking report",
];

export function requireScreenshotSchema(connectionString) {
  const schema = new URL(connectionString).searchParams.get("schema");
  if (!/^bisibility_screenshot_\d+_[a-f0-9]{12}$/.test(schema ?? "")) {
    throw new Error("Screenshot fixtures require a disposable screenshot schema.");
  }
  return schema;
}

export async function prepareScreenshotFixtures(connectionString, projectRef) {
  requireScreenshotSchema(connectionString);
  const client = new pg.Client({
    connectionString,
    ...databaseConnectionConfig(connectionString),
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    const project = await client.query(
      'UPDATE projects SET name = $1, domain = $2, "onboardingCompletedAt" = NOW() WHERE "publicId" = $3 RETURNING id',
      ["Developer tools", "example.com", projectRef],
    );
    if (project.rowCount !== 1) throw new Error("Expected exactly one screenshot project.");
    const projectId = project.rows[0].id;
    const keywords = await client.query(
      'SELECT id FROM keywords WHERE "projectId" = $1 ORDER BY "createdAt", id',
      [projectId],
    );
    if (keywords.rowCount !== screenshotKeywords.length) throw new Error("Unexpected demo keyword count.");
    for (const [index, keyword] of keywords.rows.entries()) {
      const text = screenshotKeywords[index];
      await client.query(
        'UPDATE keywords SET text = $1, "targetUrl" = $2 WHERE id = $3',
        [text, `https://example.com/${text.replaceAll(" ", "-")}`, keyword.id],
      );
    }
    await client.query(
      'UPDATE rank_checks AS checks SET "rankingUrl" = keywords."targetUrl", "expectedUrlAtCheck" = keywords."targetUrl" FROM keywords WHERE checks."keywordId" = keywords.id AND keywords."projectId" = $1',
      [projectId],
    );
    for (const [previous, canonical, country, label] of [
      ["BE@ar", "US", "US", "United States"],
      ["ES@en", "GB", "GB", "United Kingdom"],
      ["ES", "DE@en", "DE", "Germany"],
    ]) {
      await client.query(
        'UPDATE locations SET "canonicalKey" = $1, "countryCode" = $2, "displayName" = $3, gl = $4, hl = $5, "languageCode" = $5, "languageLabel" = $6, "primaryGeoName" = $3, "secondaryGeoName" = $3 WHERE "canonicalKey" = $7',
        [canonical, country, label, country.toLowerCase(), "en", "English", previous],
      );
    }
    await client.query(
      'UPDATE keywords SET location = locations."displayName" FROM locations WHERE keywords."locationId" = locations.id AND keywords."projectId" = $1',
      [projectId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
