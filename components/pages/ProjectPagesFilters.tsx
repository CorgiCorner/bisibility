"use client";

import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Sheet } from "@/components/ui/Sheet";
import {
  projectPageCwvFilters,
  projectPageIndexGroups,
  projectPageSourceKinds,
} from "@/lib/pages/types";
import type { ProjectPagesQuery } from "@/lib/pages/url-state";
import { useTranslations } from "next-intl";

const ANY = "any";

export function ProjectPagesFilters({
  onClose,
  onQuery,
  open,
  query,
}: Readonly<{
  onClose: () => void;
  onQuery: (query: ProjectPagesQuery) => void;
  open: boolean;
  query: ProjectPagesQuery;
}>) {
  const t = useTranslations("projectPages");
  function apply(patch: Partial<ProjectPagesQuery>) {
    onQuery({ ...query, ...patch, page: 1 });
  }
  return (
    <Sheet onClose={onClose} open={open} title={t("filters.title")} widthVariant="filters">
      <div className="flex flex-col gap-4">
        <FilterSelect
          label={t("filters.sitemap")}
          onChange={(value) =>
            apply({ sitemap: value === ANY ? undefined : (value as ProjectPagesQuery["sitemap"]) })
          }
          options={[
            { label: t("filters.any"), value: ANY },
            { label: t("sitemapState.listed"), value: "listed" },
            { label: t("sitemapState.notListed"), value: "not_listed" },
          ]}
          value={query.sitemap ?? ANY}
        />
        <FilterSelect
          label={t("filters.index")}
          onChange={(value) =>
            apply({ index: value === ANY ? undefined : (value as ProjectPagesQuery["index"]) })
          }
          options={[
            { label: t("filters.any"), value: ANY },
            ...projectPageIndexGroups.map((group) => ({
              label: t(`indexGroup.${group}`),
              value: group,
            })),
          ]}
          value={query.index ?? ANY}
        />
        <FilterSelect
          label={t("filters.source")}
          onChange={(value) =>
            apply({ source: value === ANY ? undefined : (value as ProjectPagesQuery["source"]) })
          }
          options={[
            { label: t("filters.any"), value: ANY },
            ...projectPageSourceKinds.map((kind) => ({
              label: t(`sourceKind.${kind}`),
              value: kind,
            })),
          ]}
          value={query.source ?? ANY}
        />
        <FilterSelect
          label={t("filters.cwv")}
          onChange={(value) =>
            apply({ cwv: value === ANY ? undefined : (value as ProjectPagesQuery["cwv"]) })
          }
          options={[
            { label: t("filters.any"), value: ANY },
            ...projectPageCwvFilters.map((filter) => ({
              label: t(`filters.cwvValue.${filter}`),
              value: filter,
            })),
          ]}
          value={query.cwv ?? ANY}
        />
        {query.coverage ? (
          <p className="m-0 text-ui-caption text-fg">
            <span className="text-fg-muted">{t("filters.coverage")}</span> {query.coverage}
          </p>
        ) : null}
        <Button
          className="self-start"
          size="input"
          onClick={() =>
            apply({
              coverage: undefined,
              cwv: undefined,
              index: undefined,
              sitemap: undefined,
              source: undefined,
            })
          }
          type="button"
          variant="ghost"
        >
          {t("filters.clear")}
        </Button>
      </div>
    </Sheet>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: Readonly<{
  label: string;
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  value: string;
}>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-ui-caption text-fg-muted">{label}</span>
      <MenuSelect
        ariaLabel={label}
        onChange={onChange}
        options={options}
        size="input"
        value={value}
      />
    </div>
  );
}
