"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { inputClassName } from "@/components/ui/input-styles";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Switch } from "@/components/ui/Switch";
import type { WebhookEndpointView } from "@/lib/alerts/alert-data";
import { formatDateTime } from "@/lib/dates/format";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type EndpointAction = (input: unknown) => Promise<unknown>;

type WebhookEndpointRowProps = {
  deleteAction?: EndpointAction;
  endpoint: WebhookEndpointView;
  projectId: string;
  testAction?: EndpointAction;
  upsertAction: EndpointAction;
};

const fieldClass = `${inputClassName} min-h-10 w-full rounded-control px-3 py-2 text-[13px]`;

function actionResponse(result: unknown) {
  return result && typeof result === "object" ? (result as Record<string, unknown>) : {};
}

function attemptStatusLabel(
  status: string,
  t: ReturnType<typeof useTranslations<"projectAlerts.webhook">>,
) {
  if (status === "failed") return t("attemptStatusFailed");
  if (status === "pending") return t("attemptStatusPending");
  if (status === "sent") return t("attemptStatusSent");
  if (status === "skipped") return t("attemptStatusSkipped");
  return t("attemptStatusUnknown", { status });
}

export function WebhookEndpointRow({
  deleteAction,
  endpoint,
  projectId,
  testAction,
  upsertAction,
}: Readonly<WebhookEndpointRowProps>) {
  const t = useTranslations("projectAlerts.webhook");
  const dateFormat = useDateFormat();
  const lastDeliveryAt = endpoint.lastDeliveryAt;
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
        setError(typeof response.error === "string" ? response.error : t("updateError"));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(t("updateError"));
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
      setStatus(t("updated"));
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
      setStatus(next ? t("enabledStatus") : t("disabledStatus"));
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
        ? t("testSuccess", { latency, status: httpStatus })
        : t("testFailure", { latency });
      if (response.ok === true) {
        setStatus(message);
      } else {
        setError(
          t("testErrorDetail", {
            error: String(response.error ?? t("testError")),
            message,
          }),
        );
      }
    } catch {
      setError(t("testError"));
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
        setError(String(response.error ?? t("deleteError")));
        setConfirmingDelete(false);
        return;
      }
      setConfirmingDelete(false);
      router.refresh();
    } catch {
      setError(t("deleteError"));
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid min-w-0 gap-2 rounded-control border border-border bg-bg-elev p-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{endpoint.url}</span>
        <span className={endpoint.enabled ? "text-green-text" : "text-fg-muted"}>
          {endpoint.enabled ? t("enabledState") : t("disabled")}
        </span>
      </div>
      {editing ? (
        <div className="grid gap-2">
          <label>
            {t("editUrl")}
            <input
              className={fieldClass}
              onChange={(event) => setUrl(event.target.value)}
              value={url}
            />
          </label>
          <label>
            {t("descriptionLabel")}
            <input
              className={fieldClass}
              maxLength={160}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>
          <label htmlFor={`webhook-rotation-${endpoint.id}`}>
            {t("newSecret")}
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
            label={t("enabled")}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button disabled={busy || !url} onClick={() => void saveEdit()} size="sm" type="button">
              {t("saveChanges")}
            </Button>
            <Button onClick={() => setEditing(false)} size="sm" type="button" variant="secondary">
              {t("cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setEditing(true)} size="sm" type="button" variant="secondary">
              {t("edit")}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void toggleEnabled()}
              size="sm"
              type="button"
              variant="secondary"
            >
              {endpoint.enabled ? t("disable") : t("enable")}
            </Button>
            {testAction ? (
              <Button
                disabled={busy || !endpoint.enabled}
                onClick={() => void sendTest()}
                size="sm"
                type="button"
                variant="secondary"
              >
                {t("test")}
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
                {t("delete")}
              </Button>
            ) : null}
          </>
        )}
      </div>
      <div
        aria-label={t("deliveryHistory", { url: endpoint.url })}
        className="grid gap-1 border-t border-border pt-2 text-[10.5px] text-fg-muted"
      >
        <p className="m-0">
          {lastDeliveryAt
            ? t.rich("lastSuccessful", {
                time: (chunks) => <time dateTime={lastDeliveryAt}>{chunks}</time>,
                value: formatDateTime(new Date(lastDeliveryAt), dateFormat),
              })
            : t("lastSuccessfulNone", { value: t("none") })}
        </p>
        {endpoint.deliveryAttempts?.length ? (
          <ul className="m-0 grid gap-1 p-0">
            {endpoint.deliveryAttempts.map((attempt, index) => (
              <li className="grid gap-0.5" key={`${attempt.attemptedAt}:${attempt.event}:${index}`}>
                <span>
                  <time dateTime={attempt.attemptedAt}>
                    {formatDateTime(new Date(attempt.attemptedAt), dateFormat)}
                  </time>{" "}
                  {attempt.event} {attemptStatusLabel(attempt.status, t)}
                </span>
                {attempt.error ? <span className="text-red-text">{attempt.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0">{t("noDeliveries")}</p>
        )}
      </div>
      {error ? (
        <p className="m-0 text-[10.5px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="m-0 text-[10.5px] text-green-text" role="status">
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
