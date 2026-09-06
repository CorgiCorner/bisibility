"use client";

import { Card, Sheet } from "@/components/ui";
import {
  resolveSetupProgress,
  type SetupContext,
  type SetupCta,
  type SetupStepId,
} from "@/lib/getting-started/setup-steps";
import useMediaQuery from "@mui/material/useMediaQuery";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import { useState } from "react";
import { StepGlyph } from "./StepGlyph";
import { StepStateMeta } from "./StepStateMeta";
import { VideoWalkthroughPlaceholder } from "./VideoWalkthroughPlaceholder";
import { Walkthrough } from "./Walkthrough";

type GettingStartedChecklistProps = {
  context: SetupContext;
  now: Date;
  onCta: (cta: SetupCta) => void;
};

export function GettingStartedChecklist({
  context,
  now,
  onCta,
}: Readonly<GettingStartedChecklistProps>) {
  const progress = resolveSetupProgress(context);
  const initialId =
    progress.steps.find(({ state }) => state.family !== "done")?.definition.id ??
    progress.steps[0].definition.id;
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
                    />
                    <span className="pointer-events-none min-w-0 flex-1">
                      <span
                        className={`block text-[13.5px] font-semibold leading-5 ${state.family === "done" ? "text-fg-muted line-through" : "text-fg"}`}
                        id={titleId}
                      >
                        {definition.title}
                      </span>
                      <StepStateMeta id={metaId} now={now} onCta={onCta} state={state} />
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
                        {isDesktop ? (
                          <Walkthrough
                            expanded={expanded}
                            id={definition.id}
                            onCta={onCta}
                            state={state}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="hidden min-w-0 p-5 lg:flex">
          <VideoWalkthroughPlaceholder videoRef={selected.definition.videoRef} />
        </section>
      </div>
      {!isDesktop && mobileOpen ? (
        <Sheet onClose={() => setMobileOpenId(null)} open title={mobileOpen.definition.title}>
          <Walkthrough id={mobileOpen.definition.id} onCta={onCta} state={mobileOpen.state} />
        </Sheet>
      ) : null}
    </Card>
  );
}
