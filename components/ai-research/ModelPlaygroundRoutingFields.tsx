"use client";
import { FormField } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { modelColumnSchema } from "@/lib/model-playground/schema";
import type { ModelColumn } from "@/lib/model-playground/types";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

/** Comma-separated entry follows the keyword drawer's multi-value field. */
export function ModelPlaygroundRoutingFields({
  column,
  disabled,
  onChange,
}: Readonly<{
  column: ModelColumn;
  disabled: boolean;
  onChange: (settings: ModelColumn["settings"]) => void;
}>) {
  const t = useTranslations("projectAiResearch.modelPlayground");
  const id = useId();
  const [providersText, setProvidersText] = useState(
    column.settings.allowedProviders?.join(", ") ?? "",
  );
  const workspace = column.providerId === "anthropic";
  if (!workspace && column.providerId !== "vercel_ai_gateway") return null;
  const value = workspace ? (column.settings.workspaceId ?? "") : providersText;
  const parsed = modelColumnSchema.safeParse(column);
  const issue = parsed.error?.issues.find((issue) =>
    issue.path.includes(workspace ? "workspaceId" : "allowedProviders"),
  );
  const error = issue
    ? workspace
      ? t("workspaceInvalid")
      : t("allowedProvidersInvalid")
    : undefined;
  return (
    <FormField
      htmlFor={id}
      label={workspace ? t("workspaceId") : t("allowedProviders")}
      captionId={`${id}-hint`}
      caption={workspace ? t("workspaceHint") : t("allowedProvidersHint")}
    >
      <Input
        id={id}
        value={value}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        onChange={(event) => {
          const text = event.target.value;
          if (workspace) {
            const { workspaceId: _workspace, ...settings } = column.settings;
            onChange(text === "" ? settings : { ...settings, workspaceId: text });
          } else {
            setProvidersText(text);
            const { allowedProviders: _providers, ...settings } = column.settings;
            onChange(
              text === ""
                ? settings
                : {
                    ...settings,
                    allowedProviders: text
                      .split(",")
                      .map((part) => part.trim()) as ModelColumn["settings"]["allowedProviders"],
                  },
            );
          }
        }}
      />
      {error ? (
        <p className="m-0 text-ui-caption text-red-text" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </FormField>
  );
}
