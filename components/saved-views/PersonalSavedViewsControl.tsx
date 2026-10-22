"use client";

import { Button } from "@/components/ui/Button";
import { menuSelectTriggerClass } from "@/components/ui/MenuSelect";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tooltip } from "@/components/ui/Tooltip";
import type { CanonicalSavedViewResource } from "@/lib/saved-views/canonical-model";
import { canonicalSavedViewHref } from "@/lib/saved-views/navigation";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { useRef, useState } from "react";
import { PersonalSaveViewModal } from "./PersonalSaveViewModal";
import { PersonalViewMenu } from "./PersonalViewMenu";
import type { PersonalSavedViewsControlProps } from "./personal-control-types";

type ConflictScope =
  | { kind: "view"; id: string; revision: number }
  | { kind: "preference"; revision: number };

export function PersonalSavedViewsControl(props: PersonalSavedViewsControlProps) {
  return <PersonalSavedViewsSession key={props.scopeKey} {...props} />;
}

function PersonalSavedViewsSession(props: PersonalSavedViewsControlProps) {
  const { labels } = props;
  const trigger = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [showNameHint, setShowNameHint] = useState(false);
  const [savingAs, setSavingAs] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflictScope, setConflictScope] = useState<ConflictScope | null>(null);
  const [reloadRequested, setReloadRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPreference, setPreference] = useState<
    PersonalSavedViewsControlProps["preference"] | null
  >(null);
  const preference =
    savedPreference &&
    savedPreference.projectId === props.projectId &&
    savedPreference.surface === props.config.surface &&
    savedPreference.revision > props.preference.revision
      ? savedPreference
      : props.preference;
  const views = props.views.filter(
    (view) => view.projectId === props.projectId && view.surface === props.config.surface,
  );
  const active = views.find((view) => view.id === props.activeViewId) ?? null;

  const activeLabel =
    active?.name ?? (props.activeViewId ? labels.unavailableView : labels.general);
  const writable = !pending && conflictScope === null;
  const latestRevision =
    conflictScope?.kind === "view"
      ? views.find((view) => view.id === conflictScope.id)?.revision
      : preference.revision;
  const viewGone = conflictScope?.kind === "view" && latestRevision === undefined;
  const canReview =
    reloadRequested &&
    conflictScope !== null &&
    (viewGone || (latestRevision !== undefined && latestRevision > conflictScope.revision));

  async function perform(operation: () => Promise<unknown>, scope: ConflictScope) {
    if (!writable) return;
    setPending(true);
    setError(null);
    setAnchor(null);
    try {
      await operation();
    } catch (failure) {
      const conflict = Boolean(
        failure && typeof failure === "object" && "status" in failure && failure.status === 409,
      );
      setError(conflict ? labels.conflict : labels.failed);
      if (conflict) {
        setConflictScope(scope);
        setReloadRequested(false);
      }
    } finally {
      setPending(false);
    }
  }
  function select(view: CanonicalSavedViewResource | null) {
    setConflictScope(null);
    setError(null);
    setReloadRequested(false);
    setAnchor(null);
    props.onSelect(view);
  }
  function closeSave() {
    setSavingAs(false);
    trigger.current?.focus();
  }
  function deleteActive() {
    if (!active?.canDelete) return;
    void perform(
      async () => {
        const result = await props.deleteAction({
          expectedRevision: active.revision,
          projectId: props.projectId,
          viewId: active.id,
        });
        if (!result.ok) throw result.error;
        // Preserve the explicit scope until the user chooses another view.
        props.onRefresh();
      },
      { kind: "view", id: active.id, revision: active.revision },
    );
  }
  function setDefault() {
    void perform(
      async () => {
        const updated = await props.setDefaultAction({
          expectedRevision: preference.revision,
          projectId: props.projectId,
          surface: props.config.surface,
          target: active
            ? { kind: "saved_view", viewId: active.id }
            : { kind: "preset", presetId: "general" },
        });
        if (!updated.ok) throw updated.error;
        setPreference(updated.value);
        props.onRefresh();
      },
      { kind: "preference", revision: preference.revision },
    );
  }
  function saveChanges() {
    if (!active?.canEdit) return;
    void perform(
      async () => {
        const updated = await props.updateAction({
          config: props.config,
          expectedRevision: active.revision,
          name: active.name,
          projectId: props.projectId,
          viewId: active.id,
        });
        if (!updated.ok) throw updated.error;
        props.onSelect(updated.value);
        props.onRefresh();
      },
      { kind: "view", id: active.id, revision: active.revision },
    );
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Tooltip
        content={activeLabel}
        disabled={!showNameHint || Boolean(anchor)}
        semantics="description"
        placement="bottom"
      >
        <button
          ref={trigger}
          type="button"
          className={`${menuSelectTriggerClass} max-w-[280px] leading-[1.25]`}
          aria-label={activeLabel}
          aria-description={
            props.modified ? `${props.scopeSummary}. ${labels.modified}` : props.scopeSummary
          }
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          disabled={pending}
          onPointerEnter={(event) => {
            const label = event.currentTarget.querySelector("[data-view-name]");
            setShowNameHint(Boolean(label && label.scrollWidth > label.clientWidth));
          }}
          onPointerLeave={() => setShowNameHint(false)}
          onClick={(event) => {
            setShowNameHint(false);
            setAnchor(event.currentTarget);
          }}
        >
          <BookmarkSimple
            weight="regular"
            className="shrink-0 text-fg-muted"
            aria-hidden
            size={15}
          />
          <span data-view-name className="min-w-0 truncate text-fg">
            {activeLabel}
          </span>
          {props.modified ? (
            <span aria-hidden className="shrink-0">
              <StatusPill status="update" label={labels.modified} />
            </span>
          ) : null}
          <CaretDown weight="regular" className="shrink-0 text-fg-muted" aria-hidden size={11} />
        </button>
      </Tooltip>
      <PersonalViewMenu
        anchor={anchor}
        active={active}
        activeViewId={props.activeViewId}
        labels={labels}
        modified={props.modified}
        pending={pending}
        views={views}
        writable={writable}
        onClose={() => setAnchor(null)}
        onDelete={deleteActive}
        onDiscard={props.onDiscard}
        onSelect={select}
        onSetDefault={setDefault}
        onSaveAs={() => {
          setAnchor(null);
          setSavingAs(true);
        }}
        onSaveChanges={saveChanges}
      />
      {preference.notice ? (
        <span role="status" className="basis-full text-[12px] text-fg-muted">
          {labels.unavailableDefault}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="basis-full text-[12px] text-red-text">
          {error}
        </span>
      ) : null}
      {conflictScope ? (
        <div className="flex basis-full flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setReloadRequested(true);
              props.onRefresh();
            }}
          >
            {labels.reloadLatest}
          </Button>
          {canReview && latestRevision !== undefined ? (
            <span className="self-center text-[12px] text-fg-muted">
              {labels.latestRevision}: {latestRevision}
            </span>
          ) : null}
          {canReview && conflictScope.kind === "view" && !viewGone ? (
            <Button
              href={canonicalSavedViewHref(props.projectId, props.config.surface, conflictScope.id)}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="sm"
            >
              {labels.openLatest}
            </Button>
          ) : null}
          {canReview ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setConflictScope(null);
                setReloadRequested(false);
                setError(null);
                trigger.current?.focus();
              }}
            >
              {labels.reviewLatest}
            </Button>
          ) : null}
        </div>
      ) : null}
      {savingAs ? (
        <PersonalSaveViewModal
          props={props}
          onClose={closeSave}
          onSaved={(view) => {
            closeSave();
            props.onClearDraft?.();
            props.onSelect(view);
            props.onRefresh();
          }}
        />
      ) : null}
    </div>
  );
}
