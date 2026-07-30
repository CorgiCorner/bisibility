"use client";

import { Button, ConfirmModal, PasswordInput, Switch } from "@/components/ui";
import type { WebhookEndpointView } from "@/lib/alerts/alert-data";
import { useRouter } from "next/navigation";
import { useState } from "react";

type EndpointAction = (input: unknown) => Promise<unknown>;

type WebhookEndpointRowProps = {
  deleteAction?: EndpointAction;
  endpoint: WebhookEndpointView;
  projectId: string;
  testAction?: EndpointAction;
  upsertAction: EndpointAction;
};

const fieldClass =
  "min-h-10 w-full rounded-[9px] border border-border-strong bg-bg-elev px-3 py-2 text-[13px] text-fg outline-none focus:border-accent";

function actionResponse(result: unknown) {
  return result && typeof result === "object" ? (result as Record<string, unknown>) : {};
}

export function WebhookEndpointRow({
  deleteAction,
  endpoint,
  projectId,
  testAction,
  upsertAction,
}: Readonly<WebhookEndpointRowProps>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [description, setDescription] = useState(endpoint.description ?? "");
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(endpoint.enabled);
  const [error, setError] = useState<string | null>(null);
  const [rotationSecret, setRotationSecret] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [url, setUrl] = useState(endpoint.url);

  async function update(fields: {
    description: string;
    enabled: boolean;
    hmacSecret?: string;
    url: string;
  }) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = actionResponse(
        await upsertAction({ ...fields, endpointId: endpoint.id, projectId }),
      );
      if (response.ok === false) {
        setError(
          typeof response.error === "string"
            ? response.error
            : "Webhook endpoint could not be updated.",
        );
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Webhook endpoint could not be updated.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (
      await update({
        description,
        enabled,
        ...(rotationSecret ? { hmacSecret: rotationSecret } : {}),
        url,
      })
    ) {
      setEditing(false);
      setRotationSecret("");
      setStatus("Endpoint updated.");
    }
  }

  async function toggleEnabled() {
    const next = !endpoint.enabled;
    if (
      await update({
        description: endpoint.description ?? "",
        enabled: next,
        url: endpoint.url,
      })
    ) {
      setStatus(next ? "Endpoint enabled." : "Endpoint disabled.");
    }
  }

  async function sendTest() {
    if (!testAction) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = actionResponse(await testAction({ endpointId: endpoint.id, projectId }));
      const latency = typeof response.latencyMs === "number" ? response.latencyMs : 0;
      const httpStatus = typeof response.status === "number" ? response.status : null;
      const message = httpStatus
        ? `HTTP ${httpStatus} in ${latency} ms`
        : `Delivery failed in ${latency} ms`;
      if (response.ok === true) {
        setStatus(`${message}.`);
      } else {
        setError(`${message}: ${String(response.error ?? "Webhook test delivery failed.")}`);
      }
    } catch {
      setError("Webhook test delivery failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteAction) return;
    setBusy(true);
    setError(null);
    try {
      const response = actionResponse(await deleteAction({ endpointId: endpoint.id, projectId }));
      if (response.ok === false) {
        setError(String(response.error ?? "Webhook endpoint could not be deleted."));
        setConfirmingDelete(false);
        return;
      }
      setConfirmingDelete(false);
      router.refresh();
    } catch {
      setError("Webhook endpoint could not be deleted.");
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid min-w-0 gap-2 rounded-[9px] border border-border bg-bg-elev p-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{endpoint.url}</span>
        <span className={endpoint.enabled ? "text-green" : "text-fg-faint"}>
          {endpoint.enabled ? "enabled" : "disabled"}
        </span>
      </div>
      {editing ? (
        <div className="grid gap-2">
          <label>
            URL
            <input
              className={fieldClass}
              onChange={(event) => setUrl(event.target.value)}
              value={url}
            />
          </label>
          <label>
            Description
            <input
              className={fieldClass}
              maxLength={160}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>
          <label htmlFor={`webhook-rotation-${endpoint.id}`}>
            New HMAC secret (optional)
            <PasswordInput
              className={fieldClass}
              id={`webhook-rotation-${endpoint.id}`}
              minLength={16}
              onChange={(event) => setRotationSecret(event.target.value)}
              value={rotationSecret}
            />
          </label>
          <Switch
            checked={enabled}
            label="Enabled"
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button disabled={busy || !url} onClick={() => void saveEdit()} size="sm" type="button">
              Save changes
            </Button>
            <Button onClick={() => setEditing(false)} size="sm" type="button" variant="secondary">
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setEditing(true)} size="sm" type="button" variant="secondary">
              Edit
            </Button>
            <Button
              disabled={busy}
              onClick={() => void toggleEnabled()}
              size="sm"
              type="button"
              variant="secondary"
            >
              {endpoint.enabled ? "Disable" : "Enable"}
            </Button>
            {testAction ? (
              <Button
                disabled={busy || !endpoint.enabled}
                onClick={() => void sendTest()}
                size="sm"
                type="button"
                variant="secondary"
              >
                Send test event
              </Button>
            ) : null}
            {deleteAction ? (
              <Button
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
                size="sm"
                type="button"
                variant="secondary"
              >
                Delete
              </Button>
            ) : null}
          </>
        )}
      </div>
      <div
        aria-label={`Delivery history for ${endpoint.url}`}
        className="grid gap-1 border-t border-border pt-2 text-[10.5px] text-fg-muted"
      >
        <p className="m-0">
          Last successful delivery:{" "}
          {endpoint.lastDeliveryAt ? (
            <time dateTime={endpoint.lastDeliveryAt}>
              {new Date(endpoint.lastDeliveryAt).toLocaleString()}
            </time>
          ) : (
            "None"
          )}
        </p>
        {endpoint.deliveryAttempts?.length ? (
          <ul className="m-0 grid gap-1 p-0">
            {endpoint.deliveryAttempts.map((attempt, index) => (
              <li className="grid gap-0.5" key={`${attempt.attemptedAt}:${attempt.event}:${index}`}>
                <span>
                  <time dateTime={attempt.attemptedAt}>
                    {new Date(attempt.attemptedAt).toLocaleString()}
                  </time>{" "}
                  {attempt.event} {attempt.status}
                </span>
                {attempt.error ? <span className="text-red">{attempt.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0">No deliveries yet</p>
        )}
      </div>
      {error ? (
        <p className="m-0 text-[10.5px] text-red" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="m-0 text-[10.5px] text-green" role="status">
          {status}
        </p>
      ) : null}
      <ConfirmModal
        busy={busy}
        kind="deleteWebhookEndpoint"
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void remove()}
        open={confirmingDelete}
        showConfirmationToast={false}
      />
    </li>
  );
}
