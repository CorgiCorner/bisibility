import { createHash } from "node:crypto";
import { composeStories } from "@storybook/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, expect, it, vi } from "vitest";
import * as stories from "./OssComposition.stories";
import { runAccountStep } from "./oss-account-capability-steps";
import checklist from "./oss-capabilities.json";
import manifest from "./oss-capabilities-manifest.json";
import { assertCapability } from "./oss-capability-proof";
import { runStep1 } from "./oss-capability-steps-1";
import { runStep2 } from "./oss-capability-steps-2";
import { runStep3 } from "./oss-capability-steps-3";
import type { Entry } from "./oss-capability-types";

const entries: Entry[] = checklist;
const closed = entries.filter((entry) => entry.status !== "OPEN");
const open = entries.filter((entry) => entry.status === "OPEN");
// Interactions that choose a control by proof name need a separate rendered state.
const namedInteractions = new Set([
  "sort",
  "accounts-sort",
  "reference-sort",
  "recovery-filter",
  "ops-sort",
  "recovery-sort",
  "evidence-sort",
  "parity-sort",
  "budget-help",
  "parity-copy",
  "audit-column-sort",
  "mail-select",
  "audit-filter",
]);
const groups = Object.values(
  closed.reduce<Record<string, Entry[]>>((result, entry) => {
    const interaction = entry.interaction ?? [];
    const name = interaction.some((step) => namedInteractions.has(step))
      ? [entry.proof.name, entry.proof.text, entry.proof.within?.name, entry.proof.scopeText]
      : "";
    const key = JSON.stringify([entry.story, entry.tab, entry.subtab, interaction, name]);
    if (!result[key]) result[key] = [];
    result[key].push(entry);
    return result;
  }, {}),
);
// Storybook makes decorator args invariant; the runtime composition preserves this module.
const storyMap = composeStories(
  stories as unknown as Parameters<typeof composeStories>[0],
) as unknown as Record<string, ComponentType>;

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  vi.restoreAllMocks();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

it("requires every retained operations capability to be asserted", () => {
  console.info(`OSS operations checklist: ${closed.length} asserted, ${open.length} OPEN`);
  expect(entries).toHaveLength(378);
  expect(entries.filter((entry) => entry.id.startsWith("L"))).toHaveLength(13);
  expect(entries.filter((entry) => !entry.id.startsWith("L"))).toHaveLength(365);
  expect(entries.some((entry) => /^U(?:00[1-9]|01[0-3])$/.test(entry.id))).toBe(false);
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  expect(open.map((entry) => entry.id)).toEqual([]);
  expect(entries.every((entry) => ["COVERED", "MOVED"].includes(entry.status))).toBe(true);
  expect(groups.flat().length).toBe(entries.length);
  expect(createHash("sha256").update(JSON.stringify(manifest)).digest("hex")).toBe(
    "0e4a9460d5cd31e1226b17ec9698ffdfec631c932064162d7623be1229a4b6f2",
  );
  expect(entries.map(({ id, capability }) => ({ id, capability }))).toEqual(manifest);
});

it("hides account lookup at the administration page gate", () => {
  const Story = storyMap.AdministrationForbidden;
  render(<Story />);
  expect(screen.getByRole("status")).toHaveTextContent("Administrator access is required.");
  expect(screen.queryByRole("button", { name: "Look up" })).not.toBeInTheDocument();
});

it("shows the generic operator error when a sweep throws", async () => {
  const Story = storyMap.OverviewOpsThrown;
  render(<Story />);
  fireEvent.click(screen.getByRole("button", { name: "Operations" }));
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  const region = screen.getByRole("region", { name: "Ops events" });
  fireEvent.click(within(region).getByRole("button", { name: "Run outbox sweep" }));
  expect(await within(region).findByRole("status")).toHaveTextContent(
    "The operator action could not be completed.",
  );
});

it("shows the mail clear pending label while the callback is unresolved", async () => {
  const Story = storyMap.MailClearPending;
  render(<Story />);
  fireEvent.click(screen.getByRole("button", { name: "Clear saved settings" }));
  expect(await screen.findByRole("button", { name: "Clearing..." })).toBeDisabled();
});

it.each(groups.map((group) => ({ group, ids: group.map((entry) => entry.id).join(", ") })))(
  "asserts capabilities $ids",
  async ({ group }) => {
    const { story, proof, interaction = [] } = group[0];
    localStorage.clear();
    const selected = storyMap[story];
    expect(selected, `Unknown composition story: ${story}`).toBeDefined();
    const Story = selected;
    const result = render(<Story />);
    if (story !== "Polish") {
      const nav = within(
        screen.getByRole("navigation", { name: "Instance administration sections", hidden: true }),
      );
      const tabButton = nav.getByRole("button", { name: group[0].tab, hidden: true });
      if (tabButton.getAttribute("aria-current") !== "page") fireEvent.click(tabButton);
      const subnav = screen.queryByRole("navigation", {
        name: `${group[0].tab} views`,
        hidden: true,
      });
      if (subnav) {
        const subButton = within(subnav).getByRole("button", {
          name: group[0].subtab === "Settings" ? "Settings" : group[0].subtab,
          hidden: true,
        });
        if (subButton.getAttribute("aria-current") !== "page") fireEvent.click(subButton);
      }
    }
    for (const step of interaction) {
      const handled =
        runAccountStep(step, proof) ||
        (await runStep1(step, proof)) ||
        (await runStep2(step, proof)) ||
        (await runStep3(step, proof));
      if (!handled) throw new Error(`Unknown interaction ${step}`);
    }
    for (const entry of group) await assertCapability(entry, story, interaction, result);
  },
  180000,
);
