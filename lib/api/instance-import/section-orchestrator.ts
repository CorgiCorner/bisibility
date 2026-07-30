import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import type { KeywordMaps } from "./importers";
import type { Project, VerifiedMigrationToken } from "./jobs";
import type { CloudImportBody } from "./schemas";
import {
  importAlertRules,
  importCompetitors,
  importNotificationPreferences,
  importSavedViews,
} from "./sections";

export async function importCloudImportSections(
  token: VerifiedMigrationToken,
  project: Project,
  body: Pick<
    CloudImportBody,
    "__sections" | "alertRules" | "competitors" | "notificationPreferences" | "savedViews"
  >,
  keywordMaps: KeywordMaps,
  client: Prisma.TransactionClient,
) {
  const sectionCounts: Record<string, number> = {};
  if (body.__sections.alertRules) {
    const counts = body.alertRules.length
      ? await importAlertRules(project.id, body.alertRules, keywordMaps, client)
      : { imported: 0, skipped: 0 };
    Object.assign(sectionCounts, {
      alert_rules: counts.imported,
      alert_rules_skipped: counts.skipped,
    });
  }
  if (body.__sections.competitors) {
    const counts = body.competitors.length
      ? await importCompetitors(project.id, body.competitors, client)
      : { imported: 0, skipped: 0 };
    sectionCounts.competitors = counts.imported;
    sectionCounts.competitors_skipped = counts.skipped;
  }
  if (body.__sections.notificationPreferences) {
    const counts = body.notificationPreferences.length
      ? await importNotificationPreferences(project, token, body.notificationPreferences, client)
      : { imported: 0, skipped: 0 };
    sectionCounts.notification_preferences = counts.imported;
    sectionCounts.notification_preferences_skipped = counts.skipped;
  }
  if (body.__sections.savedViews) {
    const counts = body.savedViews.length
      ? await importSavedViews(project.id, body.savedViews, client)
      : { imported: 0, skipped: 0 };
    sectionCounts.saved_views = counts.imported;
    sectionCounts.saved_views_skipped = counts.skipped;
  }
  return sectionCounts;
}
