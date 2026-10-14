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
    <fieldset disabled={disabled} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-3 p-0 text-ui-body font-medium">{t("keywords")}</legend>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="mb-1.5 block text-ui-xs text-fg-muted">
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
          className="min-h-10"
          disabled={pending || disabled}
          onClick={() => void load()}
        >
          {t("search")}
        </Button>
      </div>
      <p className="m-0 text-ui-xs text-fg-muted">
        {t("selectedKeywords", { count: format.number(selected.length) })}
      </p>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
        {visible.map((row) => (
          <li key={row.id} className="m-0 min-w-0 list-none p-0">
            <Checkbox
              label={row.text}
              labelClassName="text-ui-body font-normal"
              containerClassName="rounded-control border border-border p-3"
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
      {!rows.length ? <p className="m-0 text-ui-xs text-fg-muted">{t("noKeywords")}</p> : null}
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
