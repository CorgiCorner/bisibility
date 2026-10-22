"use client";
import { Input } from "@/components/ui/Input";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { useTranslations } from "next-intl";
export function ResearchTextFilter({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (value: string) => void }>) {
  const t = useTranslations("projectResearch.results");
  return (
    <div className="relative w-full sm:max-w-xs">
      <MagnifyingGlassIcon
        weight="regular"
        aria-hidden
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
      />
      <Input
        aria-label={t("searchKeywords")}
        className="min-h-[34px] py-1 pl-9 text-[12px]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("searchKeywords")}
        type="search"
        value={value}
      />
    </div>
  );
}
