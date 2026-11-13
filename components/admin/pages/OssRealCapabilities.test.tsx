import "./real-page-mocks.test-fixture";
import checklist from "@/components/admin/redesign/oss-capabilities.json";
import manifest from "@/components/admin/redesign/oss-capabilities-manifest.json";
import { assertCapability } from "@/components/admin/redesign/oss-capability-proof";
import { runStep1 } from "@/components/admin/redesign/oss-capability-steps-1";
import { runStep2 } from "@/components/admin/redesign/oss-capability-steps-2";
import { runStep3 } from "@/components/admin/redesign/oss-capability-steps-3";
import type { Entry } from "@/components/admin/redesign/oss-capability-types";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { realCapability } from "./real-capability-proof.test-fixture";
import { runRealStep } from "./real-capability-steps.test-fixture";
import { realPage } from "./real-page-mocks.test-fixture";
import { renderRealPage } from "./real-page-render.test-fixture";
import { prepareRealScenario } from "./real-page-scenario.test-fixture";

const entries: Entry[] = checklist;
const groups = Object.values(
  entries.reduce<Record<string, Entry[]>>((all, entry) => {
    const key = JSON.stringify([
      entry.story,
      entry.tab,
      entry.subtab,
      entry.interaction,
      entry.proof.name,
      entry.proof.scopeText,
    ]);
    if (!all[key]) all[key] = [];
    all[key].push(entry);
    return all;
  }, {}),
);
it("keeps all 378 capability identities in the real-page sweep", () => {
  expect(entries).toHaveLength(378);
  expect(entries.map(({ id, capability }) => ({ id, capability }))).toEqual(manifest);
  expect(groups.flat()).toHaveLength(378);
});
for (const group of groups) {
  it(
    `proves real-page capabilities ${group.map((e) => e.id).join(", ")}`,
    async () => {
      const entry = group[0];
      prepareRealScenario(entry.story);
      const loading = [
        "OperationsLoading",
        "AdministrationLoading",
        "AuditLoading",
        "LoadingAccounts",
        "RecoveryLoading",
      ].includes(entry.story);
      const result = await renderRealPage(
        entry.story === "Polish" ? "Notifications" : entry.subtab,
        entry.story === "Polish" ? "pl" : "en",
        loading,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      for (const step of entry.interaction ?? []) {
        const handled =
          (await runRealStep(step, entry)) ||
          (await runStep1(step, entry.proof)) ||
          (await runStep2(step, entry.proof)) ||
          (await runStep3(step, entry.proof));
        if (!handled) throw new Error(`Unknown interaction ${step}`);
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 15));
        });
      }
      if (entry.story === "RecoveryTriageError") {
        fireEvent.click(screen.getByRole("button", { name: "Triage status" }));
        fireEvent.click(screen.getByRole("menuitem", { name: /^open$/ }));
        await waitFor(() =>
          expect(screen.getByRole("button", { name: "Save triage" })).toBeEnabled(),
        );
        fireEvent.click(screen.getByRole("button", { name: "Save triage" }));
      }
      if (entry.story === "RecoveryBatchError") {
        fireEvent.click(screen.getByRole("button", { name: "Confirm recovery" }));
      }
      for (const item of group)
        await assertCapability(realCapability(item), entry.story, entry.interaction ?? [], result);
      expect(realPage.access).toHaveBeenCalled();
    },
    // R043 renders 26 rows and selects 25 of them. Selection no longer renders the route, but the
    // table still exceeds the default budget under coverage, like the console's own cap test.
    group.some((entry) => entry.id === "R043") ? 20000 : 10000,
  );
}
