import { Checkbox } from "@/components/ui/Checkbox";
import type { AnalyticsControlId } from "@/lib/analytics/controls";
import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";
import type { FieldValues, Path, UseFormRegister } from "react-hook-form";
import { z } from "zod";

export const matchingScopeValuesSchema = z.object({
  includeSubdomains: z.boolean(),
  rootAndWww: z.boolean(),
  urlPrefix: z.boolean(),
});

export const matchingScopeFormSchema = matchingScopeValuesSchema.extend({
  projectId: z.string().trim().min(1),
});

export type MatchingScopeValues = z.infer<typeof matchingScopeValuesSchema>;
export type MatchingScopeForm = z.infer<typeof matchingScopeFormSchema>;

export const defaultMatchingScopeValues = {
  includeSubdomains: false,
  rootAndWww: true,
  urlPrefix: false,
} satisfies MatchingScopeValues;

type MatchingScopeFieldName = keyof MatchingScopeValues;

const analyticsControls = {
  includeSubdomains: "onboarding.matching_subdomains",
  rootAndWww: "onboarding.matching_root_www",
  urlPrefix: "onboarding.matching_url_prefix",
} satisfies Record<MatchingScopeFieldName, AnalyticsControlId>;

type ScopeOption = {
  description: string;
  field: MatchingScopeFieldName;
  title: string;
};

function displayDomain(domain: string | undefined) {
  return domain?.trim() || "example.com";
}

function scopeOptionsFor(
  domain: string,
  t: ReturnType<typeof useTranslations<"onboarding.matchingScope">>,
): ScopeOption[] {
  const rootDomain = domain.replace(/^www\./, "");
  const wwwDomain = `www.${rootDomain}`;
  const primaryPair = domain.startsWith("www.")
    ? `${rootDomain} and ${domain}`
    : `${domain} and ${wwwDomain}`;

  return [
    {
      description: t("rootAndWww.description", { domains: primaryPair }),
      field: "rootAndWww",
      title: t("rootAndWww.title"),
    },
    {
      description: t("includeSubdomains.description", { rootDomain }),
      field: "includeSubdomains",
      title: t("includeSubdomains.title"),
    },
    {
      description: t("urlPrefix.description", { example: `${domain}/docs/` }),
      field: "urlPrefix",
      title: t("urlPrefix.title"),
    },
  ];
}

type MatchingScopeFieldsProps<T extends FieldValues> = {
  domain?: string;
  register: UseFormRegister<T>;
  values: MatchingScopeValues;
};

export function MatchingScopeFields<T extends FieldValues>({
  domain,
  register,
  values,
}: Readonly<MatchingScopeFieldsProps<T>>) {
  const t = useTranslations("onboarding.matchingScope");
  return (
    <div className="mt-3 flex flex-col gap-2.5" data-analytics-mask>
      {scopeOptionsFor(displayDomain(domain), t).map((option) => {
        const selected = values[option.field];
        const inputId = `matching-scope-${option.field}`;

        return (
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-control border p-3.5",
              selected
                ? "border-accent bg-accent-soft"
                : "border-border-control bg-bg-elev hover:border-accent",
            )}
            htmlFor={inputId}
            key={option.field}
          >
            <Checkbox
              analytics={{ control: analyticsControls[option.field] }}
              aria-label={option.title}
              id={inputId}
              {...register(option.field as Path<T>)}
            />
            <span>
              <span className="block text-[13.5px] font-semibold">{option.title}</span>
              <span className="mt-1 block text-xs leading-5 text-fg-muted">
                {option.description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
