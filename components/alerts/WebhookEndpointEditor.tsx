"use client";

import { WebhookEndpointRow } from "@/components/alerts/WebhookEndpointRow";
import { WebhookSecretField } from "@/components/alerts/WebhookSecretField";
import { Button, inputClassName } from "@/components/ui";
import type { WebhookEndpointView } from "@/lib/alerts/alert-data";
import { useRouter } from "next/navigation";
import { useState } from "react";

type WebhookEndpointEditorProps = {
  action: (input: unknown) => Promise<unknown>;
  allowPrivateNetwork: boolean;
  deleteAction?: (input: unknown) => Promise<unknown>;
  endpoints: WebhookEndpointView[];
  projectId: string;
  testAction?: (input: unknown) => Promise<unknown>;
};

const fieldClass = `${inputClassName} min-h-10 w-full rounded-[9px] px-3 py-2 text-[13px]`;
const labelClass =
  "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";

export function WebhookEndpointEditor({
  action,
  allowPrivateNetwork,
  deleteAction,
  endpoints,
  projectId,
  testAction,
}: Readonly<WebhookEndpointEditorProps>) {
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
      setSaved(`Saved enabled endpoint ${url}.`);
      setDescription("");
      setHmacSecret("");
      setUrl("");
      router.refresh();
    } catch {
      setError("Webhook endpoint could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 rounded-[10px] border border-border-strong bg-transparent p-3">
      <p className="m-0 text-[12px] leading-relaxed text-fg-muted">
        Events: alert.fired, alert.digest, and alert.daily_cap_reached. Every enabled endpoint in
        this project receives every webhook-channel alert. The HMAC secret is encrypted at rest,
        write-only, and cannot be read back.{" "}
        {allowPrivateNetwork
          ? "This self-hosted environment allows private and loopback destinations."
          : "Private and loopback destinations are blocked by the active webhook guard."}
      </p>
      {endpoints.length > 0 ? (
        <ul className="my-2 grid gap-1 p-0 font-mono text-[10.5px] text-fg-muted">
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
        <p className="my-2 font-mono text-[10.5px] text-yellow-text">No endpoint configured yet.</p>
      )}
      <div className="mt-3 grid gap-2.5">
        <label className={labelClass}>
          Endpoint URL
          <input
            className={fieldClass}
            name="url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/alerts"
            value={url}
          />
        </label>
        <label className={labelClass}>
          Description
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
          loadingLabel="Saving..."
          onClick={() => void saveEndpoint()}
          size="sm"
          type="button"
          variant="secondary"
        >
          Save enabled endpoint
        </Button>
      </div>
    </div>
  );
}
