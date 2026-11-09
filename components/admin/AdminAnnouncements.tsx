"use client";
import { useAdminViewState } from "@/components/admin/AdminTableState";
import { AnnouncementEditor } from "@/components/admin/AnnouncementEditor";
import { DangerousActionGate } from "@/components/admin/DangerousActionGate";
import { InstanceAnnouncementBanner } from "@/components/shell/InstanceAnnouncementBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Switch } from "@/components/ui/Switch";
import {
  type AnnouncementMutation,
  mutateInstanceAnnouncement,
} from "@/lib/actions/instance-announcements";
import type {
  AnnouncementContent,
  AnnouncementResult,
  InstanceAnnouncement,
} from "@/lib/instance-announcements/schema";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

export function announcementErrorMessage(
  status: Exclude<AnnouncementResult["status"], "saved" | "deleted">,
  t: ReturnType<typeof useTranslations<"instanceAdmin.announcements">>,
) {
  return t(`errors.${status}`);
}

export function AdminAnnouncements({
  initialAnnouncements,
  onMutation = mutateInstanceAnnouncement,
  busy: externallyBusy = false,
  publicationLabels,
}: Readonly<{
  initialAnnouncements: InstanceAnnouncement[];
  onMutation?: (input: AnnouncementMutation) => Promise<AnnouncementResult>;
  busy?: boolean;
  publicationLabels?: { publish: string; archive: string };
}>) {
  const t = useTranslations("instanceAdmin.announcements");
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [editorId, setEditorId] = useAdminViewState("announcement");
  const [deleteId, setDeleteId] = useAdminViewState("deleteAnnouncement");
  const selected = announcements.find((item) => item.id === editorId);
  const editor =
    editorId === "new" ? { announcement: null } : selected ? { announcement: selected } : null;
  const deleting = announcements.find((item) => item.id === deleteId) ?? null;
  const setEditor = (value: { announcement: InstanceAnnouncement | null } | null) =>
    setEditorId(value ? (value.announcement?.id ?? "new") : null);
  const setDeleting = (value: InstanceAnnouncement | null) => setDeleteId(value?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startMutation] = useTransition();
  const busy = pending || externallyBusy;

  function mutate(input: AnnouncementMutation, close?: () => void) {
    setError(null);
    setNotice(null);
    startMutation(async () => {
      try {
        const result = await onMutation(input);
        if (result.status === "saved") {
          setAnnouncements((current) => {
            const found = current.some((item) => item.id === result.announcement.id);
            return found
              ? current.map((item) =>
                  item.id === result.announcement.id ? result.announcement : item,
                )
              : [...current, result.announcement];
          });
          setNotice(t("saved"));
          close?.();
        } else if (result.status === "deleted") {
          setAnnouncements((current) => current.filter((item) => item.id !== result.id));
          setNotice(t("deleted"));
          close?.();
        } else {
          setError(announcementErrorMessage(result.status, t));
        }
      } catch {
        setError(t("errors.unavailable"));
      }
    });
  }

  function save(content: AnnouncementContent) {
    const announcement = editor?.announcement;
    mutate(
      announcement
        ? {
            kind: "update",
            identity: { id: announcement.id, revision: announcement.revision },
            content,
          }
        : { kind: "create", content },
      () => setEditor(null),
    );
  }

  function closeDialogs() {
    setEditor(null);
    setDeleting(null);
    setError(null);
  }

  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionTitle>{t("heading")}</SectionTitle>
          <p className="mt-1 text-sm text-fg-muted">{t("description")}</p>
        </div>
        <DangerousActionGate action="changeAnnouncements">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setError(null);
              setEditor({ announcement: null });
            }}
          >
            {t("create")}
          </Button>
        </DangerousActionGate>
      </div>
      <p className="text-xs text-fg-muted">{t("refreshHelp")}</p>
      {announcements.length === 0 ? <p className="text-sm text-fg-muted">{t("empty")}</p> : null}
      {announcements.map((announcement) => (
        <div
          key={announcement.id}
          className="min-w-0 overflow-hidden rounded-control border border-border"
        >
          <InstanceAnnouncementBanner
            announcement={announcement}
            defaultLinkLabel={t("learnMore")}
            live={false}
          />
          <DangerousActionGate action="changeAnnouncements">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3">
              {publicationLabels ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    mutate({
                      kind: "toggle",
                      identity: { id: announcement.id, revision: announcement.revision },
                      enabled: !announcement.enabled,
                    })
                  }
                >
                  {announcement.enabled ? publicationLabels.archive : publicationLabels.publish}
                </Button>
              ) : (
                <Switch
                  checked={announcement.enabled}
                  disabled={busy}
                  aria-label={t("visibilityLabel", { title: announcement.title })}
                  label={announcement.enabled ? t("on") : t("off")}
                  onChange={(event) =>
                    mutate({
                      kind: "toggle",
                      identity: { id: announcement.id, revision: announcement.revision },
                      enabled: event.currentTarget.checked,
                    })
                  }
                />
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setEditor({ announcement });
                  }}
                >
                  {t("edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setDeleting(announcement);
                  }}
                >
                  {t("delete")}
                </Button>
              </div>
            </div>
          </DangerousActionGate>
        </div>
      ))}
      {notice ? (
        <p role="status" className="text-sm text-green-text">
          {notice}
        </p>
      ) : null}
      {error && !editor && !deleting ? (
        <p role="alert" className="text-sm text-red-text">
          {error}
        </p>
      ) : null}
      {editor ? (
        <AnnouncementEditor
          initial={editor.announcement}
          busy={busy}
          error={error}
          onClose={closeDialogs}
          onSave={save}
        />
      ) : null}
      {deleting ? (
        <Modal
          open
          onClose={closeDialogs}
          dismissDisabled={busy}
          title={t("deleteTitle")}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={closeDialogs}>
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                loading={busy}
                onClick={() =>
                  mutate(
                    { kind: "delete", identity: { id: deleting.id, revision: deleting.revision } },
                    closeDialogs,
                  )
                }
              >
                {t("delete")}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-fg-muted">
            {t("deleteDescription", { title: deleting.title })}
          </p>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-text">
              {error}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </Card>
  );
}
