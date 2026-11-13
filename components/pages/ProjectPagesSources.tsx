"use client";

import { ConversionSourceSwitch } from "@/components/conversions/ConversionSourceSwitch";
import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ResolvedConversionSource } from "@/lib/conversions/selection";
import type { ConversionSource } from "@/lib/conversions/types";
import { projectPageColumnConnectHref } from "@/lib/pages/source-links";
import type { ProjectPageColumnSource } from "@/lib/pages/types";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

export function ProjectPagesSources({
  canWrite,
  conversion,
  onConversion,
  onPaste,
  onRefresh,
  pending,
  projectId,
  sources,
}: Readonly<{
  canWrite: boolean;
  conversion?: ResolvedConversionSource;
  onConversion?: (source: ConversionSource) => void;
  onPaste: () => void;
  onRefresh: () => void;
  pending: boolean;
  projectId: string;
  sources: readonly ProjectPageColumnSource[];
}>) {
  const t = useTranslations("projectPages");
  const format = useFormatter();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-ui-caption">
      <Tooltip content={t("sourcesLine.hint")}>
        <span className="text-fg-muted">{t("sourcesLine.label")}</span>
      </Tooltip>
      {conversion?.showSwitch && conversion.selected ? (
        <ConversionSourceSwitch
          onChange={onConversion}
          options={conversion.options}
          value={conversion.selected}
        />
      ) : null}
      {sources.map((source) => {
        const name = sourceLabel(source, t);
        const extra =
          source.kind === "analytics" && source.note === "Plausible" ? t("plausibleWindow") : "";
        const detail = [t(`sourcesLine.state.${source.state}`), format.number(source.pages), extra]
          .filter(Boolean)
          .join(" · ");
        return (
          <span className="inline-flex items-center gap-1.5" key={source.kind}>
            <Tooltip content={detail} semantics="description">
              <span className="inline-flex items-center gap-1.5 text-fg">
                <span
                  aria-hidden
                  className={
                    source.state === "connected"
                      ? "size-1.5 rounded-full bg-green"
                      : source.state === "beta"
                        ? "size-1.5 rounded-full bg-yellow"
                        : "size-1.5 rounded-full bg-fg-muted"
                  }
                />
                {name}
              </span>
            </Tooltip>
            {source.state === "not_connected" ? (
              <Link
                className="text-accent-text"
                href={projectPageColumnConnectHref(projectId, source.kind)}
              >
                {t("sourcesLine.connect")}
              </Link>
            ) : null}
          </span>
        );
      })}
      {canWrite ? (
        <>
          <Button
            aria-expanded={Boolean(anchorEl)}
            aria-haspopup="menu"
            disabled={pending}
            endIcon={
              <CaretDownIcon aria-hidden className="text-fg-muted" size={11} weight="regular" />
            }
            onClick={(event) => {
              const trigger = event.currentTarget;
              setAnchorEl((current) => (current ? null : trigger));
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("sourcesLine.add")}
          </Button>
          <Menu
            anchorEl={anchorEl}
            onClose={() => setAnchorEl(null)}
            open={Boolean(anchorEl)}
            sideOffset={4}
          >
            <MenuItem
              onSelect={() => {
                setAnchorEl(null);
                onPaste();
              }}
            >
              {t("sourcesLine.paste")}
            </MenuItem>
            <MenuItem
              disabled={pending}
              onSelect={() => {
                setAnchorEl(null);
                onRefresh();
              }}
            >
              {pending ? t("sourcesLine.refreshing") : t("sourcesLine.refresh")}
            </MenuItem>
          </Menu>
        </>
      ) : null}
    </div>
  );
}

function sourceLabel(
  source: ProjectPageColumnSource,
  t: ReturnType<typeof useTranslations<"projectPages">>,
) {
  if (source.kind === "analytics") return t("sourceKind.analyticsConversions");
  return t(`sourceKind.${source.kind}`);
}
