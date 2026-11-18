import { FormField } from "@/components/ui/FieldLabel";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
export function Field({
  children,
  caption,
  error,
  hint,
  label,
}: Readonly<{
  children: ReactNode;
  caption?: ReactNode;
  error?: string;
  hint?: string;
  label: string;
}>) {
  return (
    <FormField help={hint} label={label} caption={caption}>
      {children}
      <ErrorText code={error} />
    </FormField>
  );
}
export function ErrorText({ code }: Readonly<{ code?: string }>) {
  const t = useTranslations("projectUsageCosts.drawer.errors");
  if (!code || code === "root") return null;
  return <p className="text-sm text-danger">{t(code as "amount")}</p>;
}
