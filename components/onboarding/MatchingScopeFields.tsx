import { Checkbox } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
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

type ScopeOption = {
  description: string;
  field: MatchingScopeFieldName;
  title: string;
};

function displayDomain(domain: string | undefined) {
  return domain?.trim() || "example.com";
}

function scopeOptionsFor(domain: string): ScopeOption[] {
  const rootDomain = domain.replace(/^www\./, "");
  const wwwDomain = `www.${rootDomain}`;
  const primaryPair = domain.startsWith("www.")
    ? `${rootDomain} and ${domain}`
    : `${domain} and ${wwwDomain}`;

  return [
    {
      description: `Counts ${primaryPair} across HTTP and HTTPS. Other subdomains stay separate.`,
      field: "rootAndWww",
      title: "Primary domain + www",
    },
    {
      description: `Also counts docs.${rootDomain}, app.${rootDomain}, blog.${rootDomain}, and any other subdomain.`,
      field: "includeSubdomains",
      title: "All subdomains",
    },
    {
      description: `Only counts pages under a specific path, for example ${domain}/docs/.`,
      field: "urlPrefix",
      title: "URL prefix only",
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
  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {scopeOptionsFor(displayDomain(domain)).map((option) => {
        const selected = values[option.field];
        const inputId = `matching-scope-${option.field}`;

        return (
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-[11px] border p-3.5",
              selected
                ? "border-accent bg-accent-soft"
                : "border-border-strong bg-bg-elev hover:border-accent",
            )}
            htmlFor={inputId}
            key={option.field}
          >
            <Checkbox
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
