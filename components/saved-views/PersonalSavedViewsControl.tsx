"use client";

import { Button } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Divider";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { menuSelectTriggerClass } from "@/components/ui/MenuSelect";
import { Tooltip } from "@/components/ui/Tooltip";
import { toolbarControlClassName } from "@/components/ui/toolbar-control-styles";
import type { CanonicalSavedViewResource } from "@/lib/saved-views/canonical-model";
import { canonicalSavedViewHref } from "@/lib/saved-views/navigation";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { useRef, useState } from "react";
import { PersonalSaveViewModal } from "./PersonalSaveViewModal";
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

  const writable = !pending && conflictScope === null;
  const latestRevision =
    conflictScope?.kind === "view"
      ? views.find((view) => view.id === conflictScope.id)?.revision
      : preference.revision;
  const canReview =
    reloadRequested &&
    conflictScope !== null &&
    latestRevision !== undefined &&
    latestRevision > conflictScope.revision;

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
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Tooltip content={props.scopeSummary} semantics="description" placement="bottom">
        <button
          ref={trigger}
          type="button"
          className={`${menuSelectTriggerClass} max-w-[190px]`}
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          disabled={pending}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <BookmarkSimple className="shrink-0 text-fg-muted" aria-hidden size={15} />
          <span className="min-w-0 truncate text-fg">
            {active?.name ?? (props.activeViewId ? labels.unavailableView : labels.general)}
          </span>
          <CaretDown className="shrink-0 text-fg-muted" aria-hidden size={11} />
        </button>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem selected={!props.activeViewId} onClick={() => select(null)}>
          {labels.general}
        </MenuItem>
        {views.map((view) => (
          <MenuItem
            key={view.id}
            selected={view.id === props.activeViewId}
            onClick={() => select(view)}
          >
            <span className="min-w-0 flex-1 truncate">{view.name}</span>
            <span className="ml-3 text-[11px] text-fg-muted">
              {view.visibility === "private" ? labels.personal : labels.project}
            </span>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          disabled={!writable || Boolean(props.activeViewId && !active)}
          onClick={setDefault}
        >
          {labels.setDefault}
        </MenuItem>
        {active?.canDelete ? (
          <MenuItem
            disabled={!writable}
            onClick={() =>
              void perform(
                async () => {
                  const result = await props.deleteAction({
                    expectedRevision: active.revision,
                    projectId: props.projectId,
                    viewId: active.id,
                  });
                  if (!result.ok) throw result.error;
                  // Preserve an explicit link to the deleted scope until the user chooses General.
                  props.onRefresh();
                },
                { kind: "view", id: active.id, revision: active.revision },
              )
            }
          >
            {labels.delete}
          </MenuItem>
        ) : null}
      </Menu>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={toolbarControlClassName}
        style={{ fontWeight: 400 }}
        disabled={pending}
        onClick={() => setSavingAs(true)}
      >
        {labels.saveAs}
      </Button>
      {props.modified ? (
        <>
          <span className="text-[12px] text-fg-muted">{labels.modified}</span>
          {active?.canEdit ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!writable}
              onClick={() =>
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
                )
              }
            >
              {labels.saveChanges}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={props.onDiscard}
          >
            {labels.discard}
          </Button>
        </>
      ) : null}
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
          {canReview ? (
            <span className="self-center text-[12px] text-fg-muted">
              {labels.latestRevision}: {latestRevision}
            </span>
          ) : null}
          {canReview && conflictScope.kind === "view" ? (
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
            props.onSelect(view);
            props.onRefresh();
          }}
        />
      ) : null}
    </div>
  );
}
