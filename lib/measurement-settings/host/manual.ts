import "server-only";
import type { MeasurementSelection } from "@/lib/measurement-settings/ui-contracts";
import {
  runSelectionKeywordHeld,
  runSelectionKeywordSelect,
} from "@/lib/rank-check/runs/selection";
import type { SerpDepth } from "@/lib/serp/constants";
import type { SettingsHostTransaction } from "./contracts";
import { settingsHash } from "./hash";
import { settingsNativeEstimate } from "./native-estimate";
import { assertSettingsSelection } from "./selection";
import type { SettingsSource } from "./source";

export async function settingsManualEvidence(
  tx: SettingsHostTransaction,
  source: SettingsSource,
  selection: MeasurementSelection,
  now: Date,
) {
  const { geo, connection } = assertSettingsSelection(source, selection);
  const rows = await tx.keyword.findMany({
    where: {
      projectId: source.project.id,
      archivedAt: null,
      device: selection.device,
      locationId: geo.id,
    },
    orderBy: { id: "asc" },
    select: { ...runSelectionKeywordSelect, publicId: true },
  });
  const executable = rows.filter((row) => !runSelectionKeywordHeld(row, "manual"));
  const native = await settingsNativeEstimate(
    tx,
    connection,
    executable.map((row) => ({ keyword: row.text, depth: selection.depth as SerpDepth })),
    now,
  );
  return {
    estimates: [native.estimate],
    versions: native.versions,
    targetIds: executable.map((row) => row.publicId),
    rateVersion: settingsHash("current-native-rates", {
      base: source.rateVersion,
      versions: native.versions,
    }),
  };
}
