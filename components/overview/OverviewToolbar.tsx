"use client";

import { Toolbar } from "@/components/shell/Toolbar";
import { Button } from "@/components/ui/Button";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { appPath } from "@/lib/routing/app-path";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { TagIcon as Tag } from "@phosphor-icons/react/dist/csr/Tag";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { OverviewView } from "./types";

type SelectedFilters = OverviewView["toolbar"];

const RANGE_OPTIONS: readonly MenuSelectOption[] = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 28 days", value: "28d" },
  { label: "Last 90 days", value: "90d" },
];

const ALL_TAGS = "__all__";

function tagOptions(tags: readonly string[]): MenuSelectOption[] {
  return [
    { label: "All tags", value: ALL_TAGS },
    ...tags.map((tag) => ({ label: tag, value: tag })),
  ];
}

export function OverviewToolbar({
  canCreateKeyword = true,
  initialSelected,
  projectRef,
}: Readonly<{
  canCreateKeyword?: boolean;
  initialSelected?: SelectedFilters;
  projectRef: string;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = initialSelected ?? {
    availableTags: [],
    device: "All devices",
    deviceValue: "all",
    marketOptions: [],
    marketValues: [],
    range: "Last 28 days",
    rangeValue: "28d",
    tag: "All tags",
    tagValue: null,
  };

  function pushFilter(key: "range" | "tag", value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    const defaults = { range: "28d", tag: null } satisfies Record<"range" | "tag", string | null>;
    if (value === defaults[key] || value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="-mx-4 -mt-4 mb-5.5 sm:-mx-5 lg:-mx-7 lg:-mt-5.5">
      <Toolbar
        action={
          canCreateKeyword ? (
            <Button
              component={Link}
              href={appPath(projectRef, "rank-tracker?add=1")}
              size="sm"
              startIcon={<Plus size={15} weight="regular" />}
              style={{ height: 37, minHeight: 37, whiteSpace: "nowrap" }}
              variant="primary"
            >
              <span className="hidden sm:inline">Add keyword</span>
              <span className="sm:hidden">Add</span>
            </Button>
          ) : null
        }
      >
        <MenuSelect
          ariaLabel="Date range"
          leadingIcon={
            <CalendarBlank weight="regular" aria-hidden className="text-fg-muted" size={15} />
          }
          onChange={(value) => pushFilter("range", value)}
          options={RANGE_OPTIONS}
          triggerClassName="overview-toolbar-filter"
          value={selected.rangeValue}
        />
        <MenuSelect
          ariaLabel="Tag"
          leadingIcon={<Tag weight="regular" aria-hidden className="text-fg-muted" size={15} />}
          onChange={(value) => pushFilter("tag", value === ALL_TAGS ? null : value)}
          options={tagOptions(selected.availableTags)}
          triggerClassName="overview-toolbar-filter"
          value={selected.tagValue ?? ALL_TAGS}
        />
      </Toolbar>
    </div>
  );
}
