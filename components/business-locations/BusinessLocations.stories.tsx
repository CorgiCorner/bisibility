import { Button } from "@/components/ui/Button";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { BusinessArchivePrompt } from "./BusinessArchivePrompt";
import { BusinessCandidateReview } from "./BusinessCandidateReview";
import { BusinessIdentityEditor } from "./BusinessIdentityEditor";
import { BusinessLocationsList } from "./BusinessLocationsList";
import { BusinessRematchPrompt } from "./BusinessRematchPrompt";
import { BusinessSubjectAssignment } from "./BusinessSubjectAssignment";
import type {
  BusinessCommandPort,
  CreateLocationCommand,
  LocationSummary,
  ReviseLocationCommand,
} from "./contracts";
import {
  archivedBranch,
  competitorBranch,
  northBranch,
  ownerPermissions,
  projectId,
  southBranch,
  businessFixtureTranslate as translate,
  unassigned,
  viewerPermissions,
  weakCandidate,
} from "./test-fixtures";

function BusinessLocationsStory({
  mode = "editor",
  conflict = false,
  viewer = false,
}: {
  mode?: "editor" | "list" | "assignment" | "candidate" | "hard_conflict" | "archive" | "rematch";
  conflict?: boolean;
  viewer?: boolean;
}) {
  const [location, setLocation] = useState(northBranch);
  const [selected, setSelected] = useState<string | null>(null);
  const [assignment, setAssignment] = useState(unassigned);
  const [decision, setDecision] = useState(weakCandidate);
  const [closed, setClosed] = useState(false);
  const permissions = viewer ? viewerPermissions : ownerPermissions;
  const onCancel = () => setClosed(true);
  const onFocusReturn = () => document.getElementById("business-story-reopen")?.focus();
  const save: BusinessCommandPort<
    CreateLocationCommand | ReviseLocationCommand,
    LocationSummary
  > = async (command) => {
    if (conflict)
      return {
        kind: "conflict",
        current: {
          ...location,
          version: 5,
          identity: {
            ...location.identity,
            revision: 4,
            revisionId: "reviewed-v4",
            address: "Server updated address",
          },
        },
      };
    return {
      kind: "saved",
      value: {
        ...location,
        version: location.version + 1,
        identity: {
          ...location.identity,
          name:
            "identity" in command
              ? command.identity.name
              : (command.patch.name ?? location.identity.name),
          revision: location.identity.revision + 1,
          revisionId: `saved-v${location.identity.revision + 1}`,
        },
      },
    };
  };
  return (
    <div className="mx-auto max-w-3xl bg-bg p-4 text-fg">
      <Button
        id="business-story-reopen"
        variant="outline"
        className="mb-4"
        onClick={() => setClosed(false)}
      >
        Open synthetic location controls
      </Button>
      {closed ? (
        <p>Closed. Previous identity remains visible in the host.</p>
      ) : (
        <>
          {mode === "editor" ? (
            <BusinessIdentityEditor
              projectId={projectId}
              location={location}
              permissions={permissions}
              translate={translate}
              save={save}
              onSaved={setLocation}
              onCancel={onCancel}
              onFocusReturn={onFocusReturn}
            />
          ) : null}
          {mode === "list" ? (
            <BusinessLocationsList
              locations={[northBranch, southBranch, archivedBranch, competitorBranch]}
              selectedLocationId={selected}
              permissions={permissions}
              translate={translate}
              onSelect={setSelected}
              onCreate={() => setSelected(null)}
              onEdit={setSelected}
              onState={(id) => setSelected(id)}
            />
          ) : null}
          {mode === "assignment" ? (
            <BusinessSubjectAssignment
              projectId={projectId}
              assignment={assignment}
              locations={[northBranch, southBranch, archivedBranch, competitorBranch]}
              permissions={permissions}
              translate={translate}
              onSaved={setAssignment}
              save={async (command) =>
                conflict
                  ? { kind: "conflict", current: { ...assignment, revision: 2 } }
                  : {
                      kind: "saved",
                      value: {
                        ...assignment,
                        revision: assignment.revision + 1,
                        target: command.target,
                        targetAvailable: true,
                      },
                    }
              }
            />
          ) : null}
          {mode === "candidate" || mode === "hard_conflict" ? (
            <BusinessCandidateReview
              projectId={projectId}
              decision={
                mode === "hard_conflict"
                  ? {
                      ...decision,
                      status: "unresolved",
                      reason: "stable_identifier_conflict",
                      matchedBy: null,
                      surface: "local_finder",
                    }
                  : decision
              }
              identityActive
              permissions={permissions}
              translate={translate}
              formatDate={(iso) => iso}
              review={async (command) =>
                conflict
                  ? { kind: "conflict", current: null }
                  : {
                      kind: "saved",
                      value: {
                        ...decision,
                        status: command.action === "confirm" ? "confirmed" : "rejected",
                        reason:
                          command.action === "confirm"
                            ? "manually_confirmed_item"
                            : "manually_rejected_item",
                        matchedBy: "manual",
                        decisionId: "decision-v2",
                        decisionRevision: 2,
                      },
                    }
              }
              onSaved={setDecision}
              onCancel={onCancel}
              onFocusReturn={onFocusReturn}
            />
          ) : null}
          {mode === "archive" ? (
            <BusinessArchivePrompt
              projectId={projectId}
              location={location}
              nextState="archived"
              permissions={permissions}
              translate={translate}
              save={async () => ({
                kind: "saved",
                value: { ...location, state: "archived", version: location.version + 1 },
              })}
              onSaved={setLocation}
              onCancel={onCancel}
              onFocusReturn={onFocusReturn}
            />
          ) : null}
          {mode === "rematch" ? (
            <BusinessRematchPrompt
              selection={{
                projectId,
                locationId: location.publicId,
                identityRevisionId: location.identity.revisionId,
                observationRunId: decision.observationRunId,
                expectedDecisions: [
                  { itemId: decision.itemId, expectedRevision: decision.decisionRevision },
                ],
              }}
              identityActive
              evidenceAvailable
              permissions={permissions}
              translate={translate}
              rematch={async () => ({ kind: "saved", value: { decisionCount: 1 } })}
              onSaved={onCancel}
              onCancel={onCancel}
              onFocusReturn={onFocusReturn}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
const meta = {
  title: "Business locations/Controls",
  component: BusinessLocationsStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BusinessLocationsStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Identity: Story = {};
export const IdentityConflict: Story = { args: { conflict: true } };
export const Viewer: Story = { args: { viewer: true } };
export const SameDomainBranches: Story = { args: { mode: "list" } };
export const ExplicitSubject: Story = { args: { mode: "assignment" } };
export const AssignmentConflict: Story = { args: { mode: "assignment", conflict: true } };
export const UnknownPromotionCandidate: Story = { args: { mode: "candidate" } };
export const HardIdentityConflict: Story = { args: { mode: "hard_conflict" } };
export const Archive: Story = { args: { mode: "archive" } };
export const RetainedRematch: Story = { args: { mode: "rematch" } };
export const MobileIdentity: Story = { parameters: { viewport: { defaultViewport: "mobile1" } } };
