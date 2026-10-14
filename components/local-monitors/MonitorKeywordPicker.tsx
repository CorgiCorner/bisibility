"use client";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import type {
  KeywordChoice,
  SearchMonitorChoices,
  SetupChoices,
} from "@/lib/local-monitors/contracts";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

export function MonitorKeywordPicker({
  projectId,
  choices,
  device,
  selected,
  disabled,
  search,
  onChange,
}: {
  projectId: string;
  choices: SetupChoices;
  device: "desktop" | "mobile";
  selected: readonly string[];
  disabled: boolean;
  search: SearchMonitorChoices;
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("shared.localMonitors");
  const id = useId();
  const format = useFormatter();
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<readonly KeywordChoice[]>(choices.keywords);
  const [known, setKnown] = useState<readonly KeywordChoice[]>(choices.keywords);
  const [cursor, setCursor] = useState(choices.nextKeyword);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  async function load(more = false) {
    const request = ++sequence.current;
    setPending(true);
    setFailed(false);
    try {
      const result = await search({
        projectId,
        search: term,
        ...(more && cursor ? { afterKeyword: cursor } : {}),
      });
      if (request !== sequence.current) return;
      setRows((previous) =>
        more
          ? [
              ...previous,
              ...result.keywords.filter((row) => !previous.some((p) => p.id === row.id)),
            ]
          : result.keywords,
      );
      setKnown((previous) => [
        ...previous,
        ...result.keywords.filter((row) => !previous.some((p) => p.id === row.id)),
      ]);
      setCursor(result.nextKeyword);
    } catch {
      if (request === sequence.current) setFailed(true);
    } finally {
      if (request === sequence.current) setPending(false);
    }
  }
  const visible = [
    ...rows,
    ...known.filter((row) => selected.includes(row.id) && !rows.some((item) => item.id === row.id)),
  ];
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-sm font-medium">{t("keywords")}</legend>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="mb-1 block text-sm">
            {t("searchKeywords")}
          </label>
          <Input
            id={id}
            value={term}
            maxLength={120}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void load();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pending || disabled}
          onClick={() => void load()}
        >
          {t("search")}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">
        {t("selectedKeywords", { count: format.number(selected.length) })}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {visible.map((row) => (
          <li key={row.id}>
            <Checkbox
              label={row.text}
              description={t(
                row.device === "mobile"
                  ? "devices.mobile"
                  : row.device === "desktop"
                    ? "devices.desktop"
                    : "devices.unknown",
              )}
              checked={selected.includes(row.id)}
              disabled={
                disabled ||
                (row.device !== device && !selected.includes(row.id)) ||
                (!selected.includes(row.id) && selected.length >= 20)
              }
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, row.id]
                    : selected.filter((value) => value !== row.id),
                )
              }
            />
          </li>
        ))}
      </ul>
      {!rows.length ? <p className="text-sm text-fg-muted">{t("noKeywords")}</p> : null}
      {cursor ? (
        <Button
          type="button"
          variant="ghost"
          disabled={pending || disabled}
          onClick={() => void load(true)}
        >
          {t("moreKeywords")}
        </Button>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-red-text">
          {t("readError")}
        </p>
      ) : null}
    </fieldset>
  );
}
