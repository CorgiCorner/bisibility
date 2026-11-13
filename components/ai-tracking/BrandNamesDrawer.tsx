"use client";

import { BrandNameTokens } from "@/components/ai-tracking/BrandNameTokens";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { InlineToken } from "@/components/ui/InlineToken";
import { Input } from "@/components/ui/Input";
import type { BrandNameCount } from "@/lib/ai-tracking/brand-name-projection";
import type { BrandNameDraft } from "@/lib/ai-tracking/brand-name-schema";
import { brandNameDraftSchema } from "@/lib/ai-tracking/brand-name-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";

type NameList = "aliases" | "excludedNames";

// A new resolver on each render makes setValue revalidate forever.
const brandNameResolver = zodResolver(brandNameDraftSchema);

export function BrandNamesDrawer({
  canWrite,
  domain,
  domainSuggestion,
  entityId,
  entityKind,
  initialAliases,
  initialCounts,
  initialExcludedNames,
  keywordSuggestions,
  label,
  onClose,
  open,
  preview,
  previewDelayMs = 300,
  save,
}: Readonly<{
  canWrite: boolean;
  domain: string | null;
  domainSuggestion: string | null;
  entityId: string;
  entityKind: "competitor" | "project";
  initialAliases: string[];
  initialCounts: BrandNameCount;
  initialExcludedNames: string[];
  keywordSuggestions: readonly string[];
  label: string;
  onClose: () => void;
  open: boolean;
  preview: (draft: BrandNameDraft) => Promise<BrandNameCount>;
  previewDelayMs?: number;
  save: (draft: BrandNameDraft) => Promise<void>;
}>) {
  const t = useTranslations("projectAiTracking.brandNames");
  const formId = useId();
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [excludedDraft, setExcludedDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [counts, setCounts] = useState(initialCounts);
  const form = useForm<BrandNameDraft>({
    defaultValues: { aliases: initialAliases, excludedNames: initialExcludedNames },
    resolver: brandNameResolver,
  });
  const aliases = form.watch("aliases");
  const excludedNames = form.watch("excludedNames");
  const fixed = [label, domain].filter((name): name is string => Boolean(name));

  function schedulePreview(draft: BrandNameDraft) {
    if (timer.current) clearTimeout(timer.current);
    const current = ++generation.current;
    const run = () => {
      void preview(draft)
        .then((next) => {
          if (generation.current !== current) return;
          setCounts(next);
          setNotice(null);
        })
        .catch(() => {
          if (generation.current === current) setNotice(t("couldNotPreview"));
        });
    };
    if (previewDelayMs === 0) run();
    else timer.current = setTimeout(run, previewDelayMs);
  }

  function addName(list: NameList, value: string) {
    const trimmed = value.trim();
    const current = form.getValues(list);
    const reserved = new Set(
      [...fixed, ...form.getValues("aliases"), ...form.getValues("excludedNames")].map((name) =>
        name.toLowerCase(),
      ),
    );
    if (!trimmed) return;
    if (trimmed.length > 120) {
      setNotice(t("tooLong"));
      return;
    }
    if (current.length >= 50) {
      setNotice(t("tooMany"));
      return;
    }
    if (reserved.has(trimmed.toLowerCase())) {
      setNotice(t("duplicate"));
      return;
    }
    const next = [...current, trimmed];
    form.setValue(list, next, { shouldDirty: true, shouldValidate: true });
    if (list === "aliases") setAliasDraft("");
    else setExcludedDraft("");
    setNotice(null);
    schedulePreview({
      aliases: list === "aliases" ? next : form.getValues("aliases"),
      excludedNames: list === "excludedNames" ? next : form.getValues("excludedNames"),
    });
  }

  function removeName(list: NameList, value: string) {
    const next = form.getValues(list).filter((name) => name !== value);
    form.setValue(list, next, { shouldDirty: true, shouldValidate: true });
    schedulePreview({
      aliases: list === "aliases" ? next : form.getValues("aliases"),
      excludedNames: list === "excludedNames" ? next : form.getValues("excludedNames"),
    });
  }

  return (
    <AppDrawer
      description={entityKind === "project" ? t("helper") : t("helperCompetitor")}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0 text-xs text-fg-muted">{t("recountNote")}</p>
          <div className="ms-auto flex gap-2">
            <Button size="input" onClick={onClose} type="button" variant="ghost">
              {t("cancel")}
            </Button>
            <Button size="input" disabled={!canWrite || pending} form={formId} type="submit">
              {t("save")}
            </Button>
          </div>
        </div>
      }
      onClose={onClose}
      open={open}
      sheetOnMobile
      title={t("title", { brand: label })}
    >
      <form
        className="flex flex-col gap-4"
        data-entity-id={entityId}
        id={formId}
        onSubmit={form.handleSubmit(async (draft) => {
          setPending(true);
          setNotice(null);
          try {
            await save(draft);
            onClose();
          } catch {
            setNotice(t("couldNotSave"));
          } finally {
            setPending(false);
          }
        })}
      >
        {notice ? (
          <p className="m-0 text-sm text-red-text" role="alert">
            {notice}
          </p>
        ) : null}
        <BrandNameTokens
          canWrite={canWrite}
          domainSuggestion={domainSuggestion}
          fixed={fixed}
          keywordSuggestions={entityKind === "project" ? keywordSuggestions : []}
          names={aliases}
          onAddSuggestion={(name) => addName("aliases", name)}
          onRemove={(name) => removeName("aliases", name)}
          unavailable={excludedNames}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={t("nameLabel")}
            disabled={!canWrite}
            onChange={(event) => setAliasDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addName("aliases", aliasDraft);
            }}
            value={aliasDraft}
          />
          <Button
            size="input"
            disabled={!canWrite}
            onClick={() => addName("aliases", aliasDraft)}
            type="button"
            variant="secondary"
          >
            {t("add")}
          </Button>
        </div>
        <p className="m-0 text-sm">
          {counts.answers === 0
            ? t("noAnswers")
            : t("namedIn", { answers: String(counts.answers), named: String(counts.named) })}
        </p>
        <Disclosure
          title={
            <span className="inline-flex items-center gap-2">
              {t("excludedNames")}
              <span className="text-fg-muted">{excludedNames.length}</span>
            </span>
          }
          variant="inline"
        >
          <div className="flex flex-col gap-3 pt-3">
            <div className="flex flex-wrap gap-2">
              {excludedNames.map((name) => (
                <InlineToken
                  key={name}
                  onDismiss={canWrite ? () => removeName("excludedNames", name) : undefined}
                  value={name}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={t("excludedNameLabel")}
                disabled={!canWrite}
                onChange={(event) => setExcludedDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addName("excludedNames", excludedDraft);
                }}
                value={excludedDraft}
              />
              <Button
                size="input"
                disabled={!canWrite}
                onClick={() => addName("excludedNames", excludedDraft)}
                type="button"
                variant="secondary"
              >
                {t("add")}
              </Button>
            </div>
          </div>
        </Disclosure>
      </form>
    </AppDrawer>
  );
}
