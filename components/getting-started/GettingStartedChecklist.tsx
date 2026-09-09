"use client";

import {
  type CompetitorSetupActions,
  ConfirmCompetitorsStep,
} from "@/components/getting-started/ConfirmCompetitorsStep";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { track } from "@/lib/analytics/client";
import {
  resolveSetupProgress,
  type SetupContext,
  type SetupCta,
  type SetupStepId,
} from "@/lib/getting-started/setup-steps";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { useState } from "react";
import { StepGlyph } from "./StepGlyph";
import { StepStateMeta } from "./StepStateMeta";
import { VideoWalkthrough } from "./VideoWalkthrough";
import { Walkthrough } from "./Walkthrough";

type GettingStartedChecklistProps = {
  competitorActions: CompetitorSetupActions;
  context: SetupContext;
  now: Date;
  onCta: (cta: SetupCta) => void;
};

export function GettingStartedChecklist({
  competitorActions,
  context,
  now,
  onCta,
}: Readonly<GettingStartedChecklistProps>) {
  const progress = resolveSetupProgress(context);
  const initialId =
    progress.steps.find(({ state }) => state.family !== "done" && state.family !== "skipped")
      ?.definition.id ?? progress.steps[0].definition.id;
  const isDesktop = useMediaQuery("(min-width:1024px)");
  const [selectedId, setSelectedId] = useState<SetupStepId>(initialId);
  const [mobileOpenId, setMobileOpenId] = useState<SetupStepId | null>(null);
  const selected =
    progress.steps.find(({ definition }) => definition.id === selectedId) ?? progress.steps[0];
  const mobileOpen = progress.steps.find(({ definition }) => definition.id === mobileOpenId);

  function selectStep(id: SetupStepId) {
    setSelectedId(id);
    if (!isDesktop) setMobileOpenId(id);
  }

  function recordCta(step: SetupStepId, cta: SetupCta, kind: "accelerate" | "primary") {
    track("getting_started_cta_clicked", { cta: kind, step });
    onCta(cta);
  }

  function renderStepContent(
    id: SetupStepId,
    state: (typeof progress.steps)[number]["state"],
    expanded?: boolean,
  ) {
    if (id === "confirm_competitors") {
      return (
        <ConfirmCompetitorsStep
          actions={competitorActions}
          projectId={context.project.publicRef ?? ""}
          state={state}
          suggestions={context.competitorSuggestions}
        />
      );
    }
    return (
      <Walkthrough
        expanded={expanded}
        id={id}
        onCta={(cta) => recordCta(id, cta, "primary")}
        state={state}
      />
    );
  }

  return (
    <Card className="overflow-hidden p-0" radius="card">
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section aria-label="Getting started checklist" className="min-w-0">
          <ol className="m-0 list-none p-0">
            {progress.steps.map(({ definition, state }, index) => {
              const titleId = `setup-step-${definition.id}-title`;
              const metaId = `setup-step-${definition.id}-meta`;
              const panelId = `setup-walkthrough-${definition.id}`;
              const hasMeta = ["waiting", "running", "blocked"].includes(state.family);
              const expanded = isDesktop
                ? selectedId === definition.id
                : mobileOpenId === definition.id;
              return (
                <li className={index === 0 ? "" : "border-t border-border"} key={definition.id}>
                  <div
                    className={`relative flex items-center gap-3 px-5 pt-3.5 ${expanded ? "pb-1.5" : "pb-3.5"}`}
                  >
                    <button
                      aria-controls={panelId}
                      aria-describedby={hasMeta ? metaId : undefined}
                      aria-expanded={expanded}
                      aria-labelledby={titleId}
                      className="absolute inset-0 z-0 rounded-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-control"
                      onClick={() => selectStep(definition.id)}
                      type="button"
                    />
                    <StepGlyph
                      blocked={state.family === "blocked"}
                      done={state.family === "done"}
                      skipped={state.family === "skipped"}
                    />
                    <span className="pointer-events-none min-w-0 flex-1">
                      <span
                        className={`block text-[13.5px] font-semibold leading-5 ${state.family === "done" ? "text-fg-muted line-through" : "text-fg"}`}
                        id={titleId}
                      >
                        {definition.title}
                      </span>
                      <StepStateMeta
                        id={metaId}
                        now={now}
                        onCta={(cta) => recordCta(definition.id, cta, "accelerate")}
                        state={state}
                      />
                    </span>
                    {expanded ? null : (
                      <CaretRight
                        aria-hidden
                        className="pointer-events-none shrink-0 text-fg-muted"
                        size={13}
                        weight="regular"
                      />
                    )}
                  </div>
                  <div
                    aria-hidden={!expanded}
                    className={`grid overflow-hidden transition-none motion-safe:[transition:grid-template-rows_.24s_cubic-bezier(.32,.72,0,1),opacity_.18s_ease] ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                    data-testid={`setup-step-panel-${definition.id}`}
                    id={panelId}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="pb-3 pl-[52px] pr-5">
                        {isDesktop ? renderStepContent(definition.id, state, expanded) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="hidden min-w-0 self-start p-5 lg:flex">
          <VideoWalkthrough step={selected.definition.id} videoRef={selected.definition.videoRef} />
        </section>
      </div>
      {!isDesktop && mobileOpen ? (
        <Sheet onClose={() => setMobileOpenId(null)} open title={mobileOpen.definition.title}>
          {renderStepContent(mobileOpen.definition.id, mobileOpen.state)}
        </Sheet>
      ) : null}
    </Card>
  );
}
