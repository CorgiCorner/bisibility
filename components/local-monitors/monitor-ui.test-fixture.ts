import { buildMonitorDefinition } from "@/lib/local-monitor-store/definition";
import { monitorDefinitionFixture, monitorKeywordFixture } from "@/lib/local-monitor-store/fixture";
import { publicMonitorDefinition } from "@/lib/local-monitor-store/projection";
import type { MonitorDetail, SetupChoices } from "@/lib/local-monitors/contracts";

const definition = buildMonitorDefinition(monitorDefinitionFixture, {
  entityId: "owned-fixture-location",
  revisionId: "owned-fixture-revision",
  keywords: [monitorKeywordFixture],
});
export const monitorUiFixture = {
  ...publicMonitorDefinition(definition),
  id: "lmn_abcdefghijklmnopqrstuvwx",
  version: 1,
  state: "active",
  revisionId: "owned-fixture-revision",
  revision: 1,
  schedule: {
    intentId: "owned-fixture-intent",
    revision: 1,
    mode: "manual",
    calendar: null,
    capabilityVersion: null,
  },
  readiness: { configurationCurrent: true, scheduledIntentCurrent: false, reasons: ["manual"] },
} satisfies MonitorDetail;
export const monitorChoiceFixture: SetupChoices = {
  subjects: [
    {
      id: monitorUiFixture.locationId,
      identityRevisionId: monitorUiFixture.identityRevisionId,
      name: "Synthetic branch",
    },
  ],
  keywords: [
    { id: monitorKeywordFixture.publicId, text: monitorKeywordFixture.text, device: "desktop" },
  ],
  subjectsMore: false,
  keywordsMore: false,
  nextSubject: null,
  nextKeyword: null,
  permissions: { canRead: true, canWrite: true },
};
