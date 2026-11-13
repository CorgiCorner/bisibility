"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { CONVERSION_SOURCE_PARAM } from "@/lib/conversions/selection";
import type { ConversionSource } from "@/lib/conversions/types";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

type SwitchOption = {
  label: string;
  primary: boolean;
  source: ConversionSource;
};

export function ConversionSourceSwitch({
  onChange,
  options,
  size = "toolbar",
  value,
}: Readonly<{
  onChange?: (source: ConversionSource) => void;
  options: readonly SwitchOption[];
  size?: "header" | "input" | "toolbar";
  value: ConversionSource;
}>) {
  const t = useTranslations("shared.conversions");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const labelFor = (option: SwitchOption) =>
    option.primary ? t("primaryOption", { label: option.label, mark: t("primary") }) : option.label;
  if (options.length < 2) {
    const only = options[0];
    if (!only) return null;
    return <span className="text-ui-caption text-fg-muted">{labelFor(only)}</span>;
  }
  return (
    <MenuSelect
      ariaLabel={t("switchLabel")}
      onChange={(next) => {
        if (!options.some((option) => option.source === next)) return;
        const source = next as ConversionSource;
        if (onChange) {
          onChange(source);
          return;
        }
        const params = new URLSearchParams(searchParams.toString());
        params.set(CONVERSION_SOURCE_PARAM, source);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }}
      options={options.map((option) => ({ label: labelFor(option), value: option.source }))}
      size={size}
      value={value}
    />
  );
}

export function ConversionConnectLink({ projectId }: Readonly<{ projectId: string }>) {
  const t = useTranslations("shared.conversions");
  return (
    <Link
      className="font-sans text-ui-caption text-accent-text no-underline underline-offset-3 hover:underline"
      href={appPath(asProjectRef(projectId), "settings", "conversions")}
    >
      {t("connect")}
    </Link>
  );
}
