"use client";

import { Button } from "@/components/ui/Button";
import { FieldLabel, FormField } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/toast-context";
import { MAX_LESSON_CHARS } from "@/lib/challenge-report/period";
import {
  type ChallengeLessons,
  lessonEntries,
  MAX_LESSON_QUESTION_CHARS,
} from "@/lib/challenge-report/schema";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useRef, useState, useTransition } from "react";

type Entry = { id: number; question: string; answer: string; custom: boolean };

export function ChallengeReportLessonsForm({
  lessons,
  projectId,
  reportId,
  saveAction,
}: Readonly<{
  lessons: ChallengeLessons;
  projectId: string;
  reportId: string;
  saveAction: (input: unknown) => Promise<{ ok: true } | { ok: false }>;
}>) {
  const t = useTranslations("challengeReport");
  const router = useRouter();
  const { showToast } = useToast();
  const formId = useId();
  const [entries, setEntries] = useState<Entry[]>(() =>
    lessonEntries(lessons, t).map((entry, id) => ({ ...entry, custom: true, id })),
  );
  const [savedEntries, setSavedEntries] = useState(entries);
  const dirty = entries !== savedEntries;
  const addButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const nextId = useRef(entries.length);
  const focusId = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, startSaving] = useTransition();
  const suggestions = [
    t("reflection.actions"),
    t("reflection.observations"),
    t("reflection.next"),
  ].filter((question) => !entries.some((entry) => entry.question === question));

  function add(question: string, custom: boolean) {
    setAdding(true);
    setMenuOpen(false);
    const id = nextId.current++;
    focusId.current = id;
    setEntries((current) => [...current, { id, question, answer: "", custom }]);
  }

  function focusNewField(id: number, field: HTMLElement | null) {
    if (!field || focusId.current !== id) return;
    focusId.current = null;
    requestAnimationFrame(() => field.focus());
  }

  function update(id: number, field: "question" | "answer", value: string) {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)),
    );
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dirty) return;
    setFailed(false);
    startSaving(async () => {
      try {
        const result = await saveAction({
          lessons: {
            entries: entries.map(({ answer, question }) => ({ answer, question: question.trim() })),
          },
          projectId,
          reportId,
        });
        if (result.ok) {
          setSavedEntries(entries);
          showToast(t("lessonsSaved"), { severity: "success" });
          router.refresh();
          return;
        }
      } catch {
        // Keep the written answers available for retry.
      }
      setFailed(true);
    });
  }

  return (
    <form className="grid gap-4" onSubmit={save}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-ui-section">{t("lessonsTitle")}</h2>
        <Button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          disabled={saving}
          onClick={() => {
            setAdding(false);
            setMenuOpen(!menuOpen);
          }}
          ref={addButton}
          size="input"
          startIcon={<PlusIcon aria-hidden size={16} weight="regular" />}
          type="button"
          variant="secondary"
        >
          {t("reflection.addQuestion")}
        </Button>
        <Menu
          align="end"
          anchorEl={addButton.current}
          onClose={() => setMenuOpen(false)}
          open={menuOpen}
          restoreFocus={!adding}
        >
          {suggestions.map((question) => (
            <MenuItem key={question} onSelect={() => add(question, false)}>
              {question}
            </MenuItem>
          ))}
          <MenuItem onSelect={() => add("", true)}>{t("reflection.add")}</MenuItem>
        </Menu>
      </div>
      {!entries.length ? (
        <p className="m-0 text-ui-body text-fg-muted">{t("reflection.empty")}</p>
      ) : null}
      {entries.map((entry) => {
        const questionId = `${formId}-question-${entry.id}`;
        const answerId = `${formId}-answer-${entry.id}`;
        return (
          <div className="grid min-w-0 gap-2 border-t border-border-soft pt-4" key={entry.id}>
            {entry.custom ? (
              <FormField htmlFor={questionId} label={t("reflection.question")}>
                <Input
                  disabled={saving}
                  id={questionId}
                  maxLength={MAX_LESSON_QUESTION_CHARS}
                  onChange={(event) => update(entry.id, "question", event.currentTarget.value)}
                  ref={(field) => focusNewField(entry.id, field)}
                  required
                  value={entry.question}
                />
              </FormField>
            ) : null}
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <div className="grid min-w-0 gap-2 text-ui-body" data-form-field="">
                <FieldLabel
                  htmlFor={answerId}
                  label={entry.custom ? t("reflection.answer") : entry.question}
                />
                <Textarea
                  className="min-h-0"
                  disabled={saving}
                  id={answerId}
                  maxLength={MAX_LESSON_CHARS}
                  onChange={(event) => update(entry.id, "answer", event.currentTarget.value)}
                  ref={entry.custom ? undefined : (field) => focusNewField(entry.id, field)}
                  rows={2}
                  value={entry.answer}
                />
              </div>
              <Button
                aria-label={t("reflection.remove")}
                className="min-w-0 px-3"
                disabled={saving}
                onClick={() => {
                  setEntries((current) => current.filter(({ id }) => id !== entry.id));
                  addButton.current?.focus();
                }}
                size="input"
                type="button"
                variant="ghost"
              >
                <TrashIcon aria-hidden size={16} weight="regular" />
              </Button>
            </div>
          </div>
        );
      })}
      {failed ? (
        <p className="m-0 text-ui-caption text-red-text" role="alert">
          {t("failed")}
        </p>
      ) : null}
      {dirty ? (
        <div className="flex justify-end">
          <Button loading={saving} size="input" type="submit">
            {t("saveLessons")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
