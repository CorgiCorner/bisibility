import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import type { NewRuleForm } from "@/lib/alerts/new-rule-data";
import { useTranslations } from "next-intl";
import type { FieldError, UseFormRegister } from "react-hook-form";

export function RuleNameField({
  error,
  register,
}: Readonly<{
  error?: FieldError;
  register: UseFormRegister<NewRuleForm>;
}>) {
  const t = useTranslations("projectAlerts.drawer");
  return (
    <div className="flex flex-col gap-[7px] font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
      <FieldLabel htmlFor="alert-rule-name" label={t("ruleName")} />
      <Input
        aria-label={t("ruleName")}
        aria-describedby="alert-rule-name-error"
        aria-invalid={Boolean(error)}
        id="alert-rule-name"
        {...register("name")}
      />
      <span className="h-8 overflow-y-auto text-red-text" id="alert-rule-name-error">
        {error?.message}
      </span>
    </div>
  );
}
