"use client";

import { createTimelineNoteFormSchema } from "@/components/timeline/timeline-note-form-schema";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import { Input } from "@/components/ui/Input";
import { Popup } from "@/components/ui/Popup";
import { Textarea } from "@/components/ui/Textarea";
import { addSignalNote, searchAnnotationPages } from "@/lib/actions/signals";
import { annotationNoteDayBounds } from "@/lib/annotations/note-day";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { projectDate } from "@/lib/presence/project-day";
import type { CreateSignalNoteInput } from "@/lib/timeline/types";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import "./annotation-note-form.module.css";

type PageChoice = { path: string; url: string };

type AnnotationNoteFormProps = {
  canCreate: boolean;
  now: string;
  projectId: string;
  timeZone: string;
};

export function AnnotationNoteForm({
  canCreate,
  now,
  projectId,
  timeZone,
}: Readonly<AnnotationNoteFormProps>) {
  const t = useTranslations("projectTimeline.annotations");
  const formCopy = useTranslations("projectTimeline.form");
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null);
  const [scopeAnchor, setScopeAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<readonly PageChoice[]>([]);
  const [pagePath, setPagePath] = useState("");
  const schema = useMemo(() => createTimelineNoteFormSchema(formCopy), [formCopy]);
  const form = useZodForm<CreateSignalNoteInput>(schema, {
    defaultValues: { happenedOn: "", note: "", projectId, severity: "info", url: "" },
    mode: "onChange",
  });
  const note = form.watch("note") ?? "";
  const happenedOn = form.watch("happenedOn") ?? "";
  const bounds = annotationNoteDayBounds(new Date(now), timeZone);
  const today = projectDate(new Date(now), timeZone);
  const day = happenedOn || today;

  if (!canCreate) return null;

  function onSubmit(values: CreateSignalNoteInput) {
    setMessage(null);
    startTransition(async () => {
      try {
        await addSignalNote({ ...values, happenedOn: values.happenedOn || today });
        form.reset({ happenedOn: "", note: "", projectId, severity: "info", url: "" });
        setPagePath("");
        router.refresh();
      } catch (error) {
        setMessage(actionErrorMessage(error, formCopy("saveError")));
      }
    });
  }

  function loadPages(next: string) {
    void searchAnnotationPages({ projectId, query: next })
      .then((result) => setPages(result.pages))
      .catch(() => setPages([]));
  }

  const dateLabel =
    day === today
      ? t("today")
      : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone }).format(
          new Date(`${day}T12:00:00Z`),
        );

  return (
    <form
      aria-label={t("addAria")}
      className="flex flex-col gap-2"
      data-annotation-composer=""
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Textarea
          className="min-h-9 max-h-32 w-full min-w-0 flex-1 py-2 leading-5"
          data-annotation-note=""
          placeholder={t("placeholder")}
          resize="none"
          rows={1}
          {...form.register("note")}
          aria-invalid={form.formState.errors.note ? true : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void form.handleSubmit(onSubmit)();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-2" data-annotation-actions="">
          <Button
            aria-expanded={dateAnchor ? true : undefined}
            aria-haspopup="dialog"
            aria-label={t("dateAria")}
            onClick={(event) => setDateAnchor(event.currentTarget)}
            size="input"
            startIcon={<CalendarBlank aria-hidden size={16} weight="regular" />}
            type="button"
            variant="secondary"
          >
            {dateLabel}
          </Button>
          <Button
            aria-expanded={scopeAnchor ? true : undefined}
            aria-haspopup="dialog"
            aria-label={t("scopeAria")}
            onClick={(event) => {
              setScopeAnchor(event.currentTarget);
              loadPages(query);
            }}
            size="input"
            type="button"
            variant="secondary"
          >
            <span className="max-w-40 truncate">{pagePath || t("wholeProject")}</span>
          </Button>
          <Button disabled={isPending || note.trim().length === 0} size="input" type="submit">
            {isPending ? formCopy("saving") : t("addNote")}
          </Button>
        </div>
      </div>
      <Popup
        anchorEl={dateAnchor}
        contentProps={{ "aria-label": t("dateAria"), className: "p-3" }}
        onClose={() => setDateAnchor(null)}
        open={dateAnchor !== null}
      >
        <Calendar
          max={bounds.max}
          min={bounds.min}
          onChange={(value) => {
            form.setValue("happenedOn", value);
            setDateAnchor(null);
          }}
          value={day}
        />
      </Popup>
      <Popup
        anchorEl={scopeAnchor}
        contentProps={{ "aria-label": t("scopeAria"), className: "grid w-72 gap-2 p-3" }}
        onClose={() => setScopeAnchor(null)}
        open={scopeAnchor !== null}
      >
        <Input
          aria-label={t("scopeSearch")}
          onChange={(event) => {
            setQuery(event.target.value);
            loadPages(event.target.value);
          }}
          value={query}
        />
        <Button
          onClick={() => {
            form.setValue("url", "");
            setPagePath("");
            setScopeAnchor(null);
          }}
          size="input"
          type="button"
          variant="ghost"
        >
          {t("wholeProject")}
        </Button>
        {pages.length === 0 ? (
          <p className="m-0 text-ui-caption text-fg-muted">{t("scopeEmpty")}</p>
        ) : (
          pages.map((page) => (
            <Button
              className="justify-start"
              key={page.path}
              onClick={() => {
                form.setValue("url", page.url);
                setPagePath(page.path);
                setScopeAnchor(null);
              }}
              size="input"
              type="button"
              variant="ghost"
            >
              <span className="truncate">{page.path}</span>
            </Button>
          ))
        )}
      </Popup>
      {message ? (
        <p className="m-0 text-ui-caption text-red-text" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
