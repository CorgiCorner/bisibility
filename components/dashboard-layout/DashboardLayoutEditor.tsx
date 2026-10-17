"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { composeDashboardLayout } from "@/lib/dashboard-layout/compose";
import type {
  DashboardDraft,
  DashboardDraftAction,
  DashboardSaveRequest,
} from "@/lib/dashboard-layout/draft";
import {
  cancelDashboardDraft,
  dashboardDraftIsDirty,
  requestDashboardSave,
  updateDashboardDraft,
} from "@/lib/dashboard-layout/draft";
import { moveDashboardWidgetTo } from "@/lib/dashboard-layout/reorder";
import type {
  DashboardAccess,
  DashboardLayout,
  DashboardPreset,
  DashboardTranslator,
  WidgetId,
} from "@/lib/dashboard-layout/types";
import { useId, useRef } from "react";
import { DashboardViewHelp } from "./DashboardViewHelp";
import { DashboardWidgetRow } from "./DashboardWidgetRow";
import { useWidgetReorder } from "./use-widget-reorder";

export type DashboardLayoutEditorProps = {
  state: DashboardDraft;
  access: DashboardAccess;
  translate: DashboardTranslator;
  onChange: (state: DashboardDraft) => void;
  layoutForPreset: (preset: DashboardPreset) => DashboardLayout;
  templateForPreset: (preset: DashboardPreset) => DashboardLayout;
  /** The host owns persistence, authz, idempotency, and applying the CAS result. */
  onSave: (request: DashboardSaveRequest) => void;
  onCancel: (state: DashboardDraft) => void;
  canSavePersonalLayout: boolean;
  onClosedFocusReturn: () => void;
};

function editorStatus(state: DashboardDraft, t: DashboardTranslator): string {
  if (state.status === "conflict") return t("conflict");
  if (state.status === "error") return t("saveError");
  if (state.status === "saving") return t("saving");
  if (state.status === "saved") return t("saved");
  return state.movement
    ? t("moved", {
        title: t(`widgets.${state.movement.id}.label`),
        position: state.movement.position,
      })
    : "";
}

export function DashboardLayoutEditor({
  state,
  access,
  translate: t,
  onChange,
  layoutForPreset,
  templateForPreset,
  onSave,
  onCancel,
  canSavePersonalLayout,
  onClosedFocusReturn,
}: DashboardLayoutEditorProps) {
  const id = useId();
  const pendingFocus = useRef<{ key: string } | null>(null);
  const composition = composeDashboardLayout(state.draft, access);
  const saving = state.status === "saving";
  const conflict = state.status === "conflict";
  function change(action: DashboardDraftAction) {
    onChange(updateDashboardDraft(state, action));
  }
  function moveTo(widget: WidgetId, target: number, control: "handle" | "up" | "down") {
    const next = moveDashboardWidgetTo(state, widget, target);
    if (next === state) return;
    const nextControl =
      control === "handle"
        ? control
        : target === 0
          ? "down"
          : target === state.draft.widgets.length - 1
            ? "up"
            : control;
    pendingFocus.current = { key: `${widget}:${nextControl}` };
    onChange(next);
  }
  const reorder = useWidgetReorder({
    order: state.draft.widgets.map((widget) => widget.id),
    disabled: saving,
    onDrop: (widget, target) => moveTo(widget, target, "handle"),
  });
  function cancel() {
    if (saving || conflict) return;
    pendingFocus.current = null;
    onCancel(cancelDashboardDraft(state));
    onClosedFocusReturn();
  }

  return (
    <Card
      component="section"
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing)
          return;
        event.preventDefault();
        event.stopPropagation();
        if (reorder.isDragging()) reorder.cancel();
        else cancel();
      }}
    >
      <header className="flex flex-col items-stretch gap-3 border-b border-border pb-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <h2 id={`${id}-title`} className="m-0 text-base font-semibold leading-6">
            {t("title")}
          </h2>
          <DashboardViewHelp label={t("viewDetails")} description={t("viewHelp")} />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 xl:justify-start">
          <span className="text-[12.5px] text-fg-muted">{t("preset")}</span>
          <MenuSelect
            ariaLabel={t("preset")}
            value={state.draft.preset}
            disabled={saving}
            options={(["general", "local", "competitors"] as const).map((preset) => ({
              value: preset,
              label: t(`presets.${preset}`),
            }))}
            onChange={(preset) => {
              reorder.cancel();
              if (preset === "general" || preset === "local" || preset === "competitors")
                change({ type: "preset", layout: layoutForPreset(preset) });
            }}
          />
        </div>
      </header>
      <p id={`${id}-reorder-hint`} className="m-0 py-2 text-[12.5px] leading-5 text-fg-muted">
        {t("reorderHint")}
      </p>
      <div
        ref={reorder.attachScroller}
        className="max-h-[min(28rem,48dvh)] min-h-32 overflow-y-auto overscroll-contain px-1 py-1"
      >
        <ol
          ref={reorder.list}
          // biome-ignore lint/a11y/noRedundantRoles: VoiceOver needs an explicit list role when native markers are removed.
          role="list"
          aria-busy={saving}
          className={`m-0 flex list-none flex-col gap-1 p-0 ${reorder.preview ? "select-none" : ""}`}
        >
          {composition.widgets.map((widget, index) => (
            <DashboardWidgetRow
              key={widget.selection.id}
              widget={widget}
              index={index}
              count={state.draft.widgets.length}
              saving={saving}
              dragging={reorder.preview?.id === widget.selection.id}
              dropEdge={
                reorder.preview?.over === index && reorder.preview.over !== reorder.preview.from
                  ? reorder.preview.over < reorder.preview.from
                    ? "before"
                    : "after"
                  : null
              }
              hintId={`${id}-reorder-hint`}
              translate={t}
              handleProps={reorder.handleProps(widget.selection.id, index)}
              controlRef={(control) => (node) => {
                const token = pendingFocus.current;
                if (!node || token?.key !== `${widget.selection.id}:${control}`) return;
                // Native DOM moves can blur a node after its ref callback runs.
                queueMicrotask(() => {
                  if (pendingFocus.current !== token) return;
                  pendingFocus.current = null;
                  if (node.isConnected && !node.disabled) node.focus();
                });
              }}
              onMove={(target, control) => moveTo(widget.selection.id, target, control)}
              onVisible={(visible) => change({ type: "visible", id: widget.selection.id, visible })}
              onSpan={(span) => change({ type: "span", id: widget.selection.id, span })}
            />
          ))}
        </ol>
      </div>
      <footer className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          aria-live="polite"
          className="m-0 min-w-0 flex-1 text-[13px] leading-5 text-fg-muted"
        >
          {editorStatus(state, t)}
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="ghost"
            className="min-h-11 xl:min-h-[34px]"
            disabled={saving || conflict}
            onClick={() => {
              reorder.cancel();
              change({ type: "reset", layout: templateForPreset(state.draft.preset) });
            }}
          >
            {t("resetPreset")}
          </Button>
          <Button
            variant="ghost"
            className="min-h-11 xl:min-h-[34px]"
            disabled={saving || conflict}
            onClick={cancel}
          >
            {t("cancel")}
          </Button>
          <Button
            className="min-h-11 xl:min-h-[34px]"
            disabled={
              !composition.authorized ||
              canSavePersonalLayout !== true ||
              saving ||
              conflict ||
              !dashboardDraftIsDirty(state)
            }
            onClick={() => {
              reorder.cancel();
              pendingFocus.current = null;
              const result = requestDashboardSave(state);
              if (result) {
                onChange(result.state);
                onSave(result.request);
              }
            }}
          >
            {t("save")}
          </Button>
        </div>
      </footer>
    </Card>
  );
}
