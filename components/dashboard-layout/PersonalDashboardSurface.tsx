"use client";

import { composeDashboardLayout } from "@/lib/dashboard-layout/compose";
import type { DashboardSaveRequest } from "@/lib/dashboard-layout/draft";
import {
  beginDashboardDraft,
  cancelDashboardDraft,
  dashboardDraftIsDirty,
  finishDashboardSave,
} from "@/lib/dashboard-layout/draft";
import type {
  DashboardAccess,
  DashboardLayout,
  DashboardPreset,
} from "@/lib/dashboard-layout/types";
import {
  readDashboardPreference,
  saveDashboardLayout,
  setDashboardDefault,
} from "@/lib/project-surface-preferences/dashboard-actions";
import {
  type DashboardSurfacePreference,
  dashboardLayoutFor,
  defaultPersonalDashboardLayout,
} from "@/lib/project-surface-preferences/dashboard-model";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState, useTransition } from "react";
import { DashboardCompositor, type DashboardCompositorProps } from "./DashboardCompositor";
import { DashboardConflictReview } from "./DashboardConflictReview";
import { DashboardLayoutEditor } from "./DashboardLayoutEditor";
import { DashboardPreferenceRecovery } from "./DashboardPreferenceRecovery";
import { DashboardToolbarSurface } from "./DashboardToolbarContext";
import { DashboardLayoutControl, DashboardPresetControl } from "./DashboardViewControls";
import { canCancelDashboardEditor } from "./dashboard-editor-escape";
import { dashboardTranslator } from "./dashboard-translator";

type Props = Pick<DashboardCompositorProps, "shell" | "widgets"> & {
  localControl?: ReactNode;
  integratedToolbar?: boolean;
  emptyState?: ReactNode;
  access: DashboardAccess;
  preference: DashboardSurfacePreference;
  layout: DashboardLayout;
};

export function PersonalDashboardSurface({
  access,
  preference: initial,
  layout,
  shell,
  widgets,
  localControl,
  integratedToolbar = false,
  emptyState,
}: Props) {
  const t = useTranslations("shared.dashboardLayout");
  const translate = dashboardTranslator(t);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [preference, setPreference] = useState(initial);
  const preset = layout.preset;
  const [state, setState] = useState(() => beginDashboardDraft(layout, initial.revision));
  const [current, setCurrent] = useState<DashboardSurfacePreference | null>(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);
  const recoveryPreference = current?.notice ? current : preference;
  const composition = composeDashboardLayout(state.draft, access);
  function select(next: DashboardPreset) {
    const params = new URLSearchParams(search.toString());
    params.set("dashboardView", next);
    router.replace(`${pathname}?${params}`);
  }
  async function reloadConflict() {
    try {
      const latest = await readDashboardPreference(preference.projectId);
      if (
        !latest.ok ||
        latest.value.projectId !== preference.projectId ||
        latest.value.revision <= state.expectedRevision
      ) {
        setMessage(t("preferenceReloadFailed"));
        return;
      }
      setCurrent(latest.value);
      setMessage(t("conflict"));
      setState((previous) => ({
        ...previous,
        status: "conflict",
        currentRevision: latest.value.revision,
      }));
    } catch {
      setMessage(t("preferenceReloadFailed"));
    }
  }
  function save(request: DashboardSaveRequest) {
    if (recoveryPreference.notice) return;
    startTransition(async () => {
      try {
        const result = await saveDashboardLayout({
          projectId: preference.projectId,
          expectedRevision: request.expectedRevision,
          layout: request.layout,
        });
        if (result.ok) {
          setPreference(result.value);
          setState((previous) =>
            finishDashboardSave(previous, {
              kind: "saved",
              attempt: request.attempt,
              revision: result.value.revision,
              layout: request.layout,
            }),
          );
          setCurrent(null);
          setMessage(t("saved"));
          if (request.layout.preset !== preset) select(request.layout.preset);
          else router.refresh();
        } else if (result.error.status === 409) {
          setState((previous) => ({ ...previous, status: "conflict", currentRevision: null }));
          await reloadConflict();
        } else {
          if (result.error.status === 404) {
            const latest = await readDashboardPreference(preference.projectId);
            if (latest.ok && latest.value.notice) setCurrent(latest.value);
          }
          setState((previous) =>
            finishDashboardSave(previous, { kind: "error", attempt: request.attempt }),
          );
        }
      } catch {
        setState((previous) =>
          finishDashboardSave(previous, { kind: "error", attempt: request.attempt }),
        );
      }
    });
  }
  function setDefault() {
    if (recoveryPreference.notice) return;
    startTransition(async () => {
      try {
        const result = await setDashboardDefault({
          projectId: preference.projectId,
          expectedRevision: state.expectedRevision,
          preset: state.draft.preset,
        });
        if (!result.ok) {
          if (result.error.status === 409) {
            setMessage(t("conflict"));
            setState((previous) => ({ ...previous, status: "conflict", currentRevision: null }));
            await reloadConflict();
          } else if (result.error.status === 404) {
            const latest = await readDashboardPreference(preference.projectId);
            if (latest.ok && latest.value.notice) setCurrent(latest.value);
          }
          if (result.error.status !== 409) setMessage(t("saveError"));
          return;
        }
        setPreference(result.value);
        setState(beginDashboardDraft(state.draft, result.value.revision));
        setMessage(t("defaultSaved"));
      } catch {
        setMessage(t("saveError"));
      }
    });
  }
  const presetControl = (
    <DashboardPresetControl
      value={preset}
      disabled={pending || dashboardDraftIsDirty(state)}
      onChange={select}
    />
  );
  const layoutControl = (
    <DashboardLayoutControl
      menu={integratedToolbar}
      trigger={trigger}
      pending={pending}
      editing={editing}
      defaultDisabled={
        pending ||
        recoveryPreference.notice !== undefined ||
        state.status === "conflict" ||
        dashboardDraftIsDirty(state) ||
        preference.defaultPreset === preset
      }
      onToggleEditing={() => setEditing((value) => !value)}
      onSetDefault={setDefault}
    />
  );
  return (
    <fieldset
      aria-label={t("title")}
      className="m-0 flex min-w-0 flex-col gap-4.5 border-0 p-0"
      onKeyDown={(event) => {
        if (canCancelDashboardEditor(event, editing, pending, state.status)) {
          setState((previous) => cancelDashboardDraft(previous));
          setEditing(false);
          trigger.current?.focus();
        }
      }}
    >
      <DashboardToolbarSurface
        integrated={integratedToolbar}
        authorized={composition.authorized}
        scope={shell.scope}
        controls={{ preset: presetControl, customization: layoutControl }}
        scopeLabel={t("shell.scope")}
        unavailable={t("shellUnavailable")}
        status={
          <p
            role="status"
            aria-live="polite"
            className={integratedToolbar && !message ? "sr-only" : "text-sm text-fg-muted"}
          >
            {message}
          </p>
        }
      />
      {dashboardDraftIsDirty(state) ? (
        <p role="status" className="text-sm text-fg-muted">
          {t("unsavedDraft")}
        </p>
      ) : null}
      <DashboardPreferenceRecovery
        preference={recoveryPreference}
        onReview={(latest, choice) => {
          if (
            latest.notice ||
            latest.projectId !== preference.projectId ||
            latest.revision <= recoveryPreference.revision
          )
            return;
          const next = beginDashboardDraft(
            dashboardLayoutFor(latest, state.draft.preset),
            latest.revision,
          );
          setState(choice === "keep_draft" ? { ...next, draft: state.draft } : next);
          setPreference(latest);
          setCurrent(null);
          trigger.current?.focus();
        }}
      />
      {localControl}
      {editing ? (
        <DashboardLayoutEditor
          state={state}
          access={access}
          translate={translate}
          onChange={setState}
          layoutForPreset={(next) => dashboardLayoutFor(preference, next)}
          templateForPreset={defaultPersonalDashboardLayout}
          onSave={save}
          canSavePersonalLayout={!recoveryPreference.notice}
          onCancel={(next) => {
            setState(next);
            setEditing(false);
          }}
          onClosedFocusReturn={() => trigger.current?.focus()}
        />
      ) : null}
      {state.status === "conflict" && !recoveryPreference.notice ? (
        <DashboardConflictReview
          state={state}
          current={current}
          projectId={preference.projectId}
          pending={pending}
          onReload={() => startTransition(reloadConflict)}
          onReview={(next, latest) => {
            setState(next);
            setPreference(latest);
            setCurrent(null);
            setMessage("");
            trigger.current?.focus();
          }}
        />
      ) : null}
      <DashboardCompositor
        emptyState={emptyState}
        composition={
          integratedToolbar
            ? { ...composition, shell: composition.shell.filter((id) => id !== "scope") }
            : composition
        }
        translate={translate}
        shell={shell}
        widgets={widgets}
      />
    </fieldset>
  );
}
