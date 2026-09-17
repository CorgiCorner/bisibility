"use client";

import { WebhookEndpointRow } from "@/components/alerts/WebhookEndpointRow";
import { WebhookSecretField } from "@/components/alerts/WebhookSecretField";
import { Button } from "@/components/ui/Button";
import { inputClassName } from "@/components/ui/input-styles";
import type { WebhookEndpointView } from "@/lib/alerts/alert-data";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type WebhookEndpointEditorProps = {
  action: (input: unknown) => Promise<unknown>;
  allowPrivateNetwork: boolean;
  deleteAction?: (input: unknown) => Promise<unknown>;
  endpoints: WebhookEndpointView[];
  projectId: string;
  testAction?: (input: unknown) => Promise<unknown>;
};

const fieldClass = `${inputClassName} min-h-10 w-full rounded-control px-3 py-2 text-[13px]`;
const labelClass =
  "flex flex-col gap-1.5 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";

export function WebhookEndpointEditor({
  action,
  allowPrivateNetwork,
  deleteAction,
  endpoints,
  projectId,
  testAction,
}: Readonly<WebhookEndpointEditorProps>) {
  const t = useTranslations("projectAlerts.webhook");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [hmacSecret, setHmacSecret] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [url, setUrl] = useState("");

  async function saveEndpoint() {
    setError(null);
    setSaved(null);
    setSubmitting(true);
    try {
      const result = await action({
        description,
        enabled: true,
        hmacSecret,
        projectId,
        url,
      });
      const response =
        result && typeof result === "object" ? (result as Record<string, unknown>) : {};
      if (response.ok === false && typeof response.error === "string") {
        setError(response.error);
        return;
      }
      setSaved(t("saved", { url }));
      setDescription("");
      setHmacSecret("");
      setUrl("");
      router.refresh();
    } catch {
      setError(t("saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 rounded-control border border-border bg-transparent p-3">
      <p className="m-0 text-[12px] leading-relaxed text-fg-muted">
        {t("description")} {allowPrivateNetwork ? t("privateAllowed") : t("privateBlocked")}
      </p>
      {endpoints.length > 0 ? (
        <ul className="my-2 grid gap-1 p-0 font-sans tabular-nums text-[10.5px] text-fg-muted">
          {endpoints.map((endpoint) => (
            <WebhookEndpointRow
              deleteAction={deleteAction}
              endpoint={endpoint}
              key={endpoint.id}
              projectId={projectId}
              testAction={testAction}
              upsertAction={action}
            />
          ))}
        </ul>
      ) : (
        <p className="my-2 font-sans tabular-nums text-[10.5px] text-yellow-text">
          {t("noneConfigured")}
        </p>
      )}
      <div className="mt-3 grid gap-2.5">
        <label className={labelClass}>
          {t("endpointUrl")}
          <input
            className={fieldClass}
            name="url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t("urlPlaceholder")}
            value={url}
          />
        </label>
        <label className={labelClass}>
          {t("descriptionLabel")}
          <input
            className={fieldClass}
            maxLength={160}
            name="description"
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </label>
        <WebhookSecretField
          fieldClassName={fieldClass}
          labelClassName={labelClass}
          onChange={setHmacSecret}
          value={hmacSecret}
        />
        {error ? (
          <p className="m-0 text-[11.5px] text-red-text" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="m-0 text-[11.5px] text-green-text" role="status">
            {saved}
          </p>
        ) : null}
        <Button
          disabled={!url || hmacSecret.length < 16}
          loading={submitting}
          loadingLabel={t("saving")}
          onClick={() => void saveEndpoint()}
          size="sm"
          type="button"
          variant="secondary"
        >
          {t("saveEnabled")}
        </Button>
      </div>
    </div>
  );
}
