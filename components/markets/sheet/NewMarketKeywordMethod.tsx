"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import type { NewMarketCreateInput } from "@/lib/markets/create-input";
import { useFormatter, useTranslations } from "next-intl";

export type NewMarketSource = { id: string; keywordCount: number; name: string };

type NewMarketKeywordMethodProps = {
  onChange: (value: NewMarketCreateInput["method"]) => void;
  pasteError: string | null;
  sources: readonly NewMarketSource[];
  value: NewMarketCreateInput["method"] | undefined;
};

function sourceOptions(
  sources: readonly NewMarketSource[],
  format: ReturnType<typeof useFormatter>,
  t: ReturnType<typeof useTranslations<"projectMarkets">>,
) {
  const largest = Math.max(0, ...sources.map((source) => source.keywordCount));
  return sources.map((source) => ({
    label: `${source.name} - ${t("keywordCount")}: ${format.number(source.keywordCount)}${source.keywordCount === largest ? ` (${t("largest")})` : ""}`,
    value: source.id,
  }));
}

export function NewMarketKeywordMethod({
  onChange,
  pasteError,
  sources,
  value,
}: Readonly<NewMarketKeywordMethodProps>) {
  const format = useFormatter();
  const t = useTranslations("projectMarkets");
  return (
    <section aria-label={t("keywordMethod")} className="grid gap-3">
      <SegmentedControl
        label={t("keywords")}
        labelClassName="text-[12px] font-medium text-fg"
        onChange={(kind) => {
          if (kind === "copy") {
            onChange({ kind, sourceMarketId: "" as `pmkt_${string}` });
          } else if (kind === "paste") {
            onChange({ kind, text: "" });
          } else if (kind === "empty") {
            onChange({ kind });
          }
        }}
        options={[
          { label: t("copyFromMarket"), value: "copy" },
          { label: t("pasteKeywords"), value: "paste" },
          { label: t("startEmpty"), value: "empty" },
        ]}
        size="field"
        value={value?.kind ?? ""}
      />
      {value?.kind === "copy" ? (
        <div className="grid gap-1.5">
          <MenuSelect
            ariaLabel={t("copyFrom")}
            onChange={(sourceMarketId) =>
              onChange({ kind: "copy", sourceMarketId: sourceMarketId as `pmkt_${string}` })
            }
            options={sourceOptions(sources, format, t)}
            searchable
            searchPlaceholder={t("findMarket")}
            size="input"
            value={value.sourceMarketId}
          />
          {sources.length === 0 ? (
            <p className="m-0 text-[12px] text-fg-muted">{t("noMarketsToCopy")}</p>
          ) : value.sourceMarketId ? null : (
            <p className="m-0 text-[12px] text-fg-muted">{t("pickMarketToCopy")}</p>
          )}
        </div>
      ) : null}
      {value?.kind === "paste" ? (
        <div className="grid gap-1.5">
          <Textarea
            aria-label={t("pasteKeywords")}
            onChange={(event) => onChange({ kind: "paste", text: event.target.value })}
            placeholder={t("pastePlaceholder")}
            resize="vertical"
            value={value.text}
          />
          {pasteError ? (
            <p className="m-0 text-[12px] text-red-text" role="alert">
              {pasteError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
