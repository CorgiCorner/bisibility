import { Button } from "@/components/ui/Button";
import type { Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";
import type { MeasurementPorts, MeasurementQuote } from "./contracts";
import { beginMeasurementDraft } from "./draft";
import { MeasurementSettingsEditor } from "./MeasurementSettingsEditor";
import {
  fixtureChoices,
  fixtureNow,
  fixturePermissions,
  fixtureProjectId,
  fixtureQuote,
  fixtureSnapshot,
  fixtureSpec,
  fixtureTranslate as translate,
  viewerPermissions,
} from "./test-fixtures";

function MeasurementSettingsStory({
  scenario = "general",
}: {
  scenario?:
    | "general"
    | "viewer"
    | "partial"
    | "budget_missing"
    | "degraded"
    | "capability_changed"
    | "rate_changed"
    | "launch_unknown"
    | "schedule_unknown"
    | "manual_only";
}) {
  const [snapshot, setSnapshot] = useState(
    scenario === "manual_only"
      ? { ...fixtureSnapshot, schedule: null, scheduleId: null }
      : fixtureSnapshot,
  );
  const [draft, onChange] = useState(() =>
    beginMeasurementDraft(
      scenario === "capability_changed"
        ? { ...snapshot, selection: { ...snapshot.selection, capabilityVersion: "old-v0" } }
        : snapshot,
    ),
  );
  const [closed, setClosed] = useState(false);
  const uncertainOnce = useRef(false);
  const ports: MeasurementPorts = {
    preview: async (request) => {
      let quote: MeasurementQuote = fixtureQuote(request);
      if (scenario === "partial")
        quote = {
          ...quote,
          manualEstimates: [
            {
              providerId: "dataforseo",
              unit: "cents",
              quantity: "0.00000000000000000001",
              certainty: "partial",
              unknownTargets: 3,
            },
            {
              providerId: "serpapi",
              unit: "searches",
              quantity: null,
              certainty: "unknown",
              unknownTargets: 2,
            },
          ],
        };
      if (scenario === "budget_missing")
        quote = {
          ...quote,
          run: {
            ...quote.run,
            budget: { ...quote.run.budget, blocked: true, reason: "budget_missing" },
          },
        };
      if (scenario === "degraded")
        quote = {
          ...quote,
          scope: {
            ...quote.scope,
            degradation: "location_coarsened",
            effectiveBasis: "resolved_request",
            effective: { ...quote.scope.configured, geoLabel: "Poland", locationKind: "country" },
          },
        };
      return { kind: "ready", value: quote };
    },
    launch: async () => {
      if (scenario === "launch_unknown" && !uncertainOnce.current) {
        uncertainOnce.current = true;
        throw new Error("Synthetic lost response");
      }
      return {
        publicId: "run_synthetic_story",
        status: "queued",
        keywordCount: 20,
        targetCount: 20,
        estimatedCostCents: 2,
      };
    },
    saveIntent: async (command) => ({
      kind: "saved",
      value: { ...snapshot, defaultIntent: command.selection, sourceHash: "d".repeat(64) },
    }),
    saveSchedule: async (command) => {
      if (scenario === "schedule_unknown" && !uncertainOnce.current) {
        uncertainOnce.current = true;
        throw new Error("Synthetic lost save response");
      }
      return {
        kind: "saved",
        value: {
          ...snapshot,
          sourceHash: "d".repeat(64),
          revision: snapshot.revision + 1,
          scheduleId: command.scheduleId,
          selection: command.selection,
          schedule: command.schedule,
        },
      };
    },
  };
  return (
    <div className="mx-auto max-w-3xl bg-bg p-4 text-fg">
      <Button
        id="measurement-story-open"
        className="mb-4"
        variant="outline"
        onClick={() => setClosed(false)}
      >
        Open synthetic measurement controls
      </Button>
      {closed ? (
        <p>Closed; the synthetic host retains its current configuration.</p>
      ) : (
        <MeasurementSettingsEditor
          projectId={fixtureProjectId}
          spec={fixtureSpec}
          draft={draft}
          onChange={onChange}
          currentSnapshot={snapshot}
          choices={fixtureChoices}
          currentRateVersion={
            scenario === "rate_changed" ? "synthetic-rate-v2" : "synthetic-rate-v1"
          }
          permissions={scenario === "viewer" ? viewerPermissions : fixturePermissions}
          ports={ports}
          translate={translate}
          now={() => new Date(fixtureNow)}
          formatDate={(iso, timezone) => `${iso}${timezone ? ` (${timezone})` : ""}`}
          formatCount={String}
          onSaved={setSnapshot}
          onStarted={() => setClosed(true)}
          onRequestCurrent={() =>
            setSnapshot((previous) => ({ ...previous, revision: previous.revision + 1 }))
          }
          onCancel={() => setClosed(true)}
          onFocusReturn={() => document.getElementById("measurement-story-open")?.focus()}
        />
      )}
    </div>
  );
}
const meta = {
  title: "Measurement settings/Controls",
  component: MeasurementSettingsStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MeasurementSettingsStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const General: Story = {};
export const Viewer: Story = { args: { scenario: "viewer" } };
export const PartialNativeAmounts: Story = { args: { scenario: "partial" } };
export const MissingBudget: Story = { args: { scenario: "budget_missing" } };
export const DegradedScope: Story = { args: { scenario: "degraded" } };
export const ChangedCapability: Story = { args: { scenario: "capability_changed" } };
export const ChangedRate: Story = { args: { scenario: "rate_changed" } };
export const UnconfirmedLaunch: Story = { args: { scenario: "launch_unknown" } };
export const UnconfirmedScheduleSave: Story = { args: { scenario: "schedule_unknown" } };
export const ManualOnly: Story = { args: { scenario: "manual_only" } };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } } };
