"use client";

import { AssistantFrame } from "@/components/assistant/AssistantFrame";
import { AssistantSetupState } from "@/components/assistant/AssistantSetupState";
import { Composer } from "@/components/assistant/Composer";
import {
  EffortSelect,
  ModelSelect,
  OutputLimitSelect,
} from "@/components/assistant/ComposerControls";
import { MessageList } from "@/components/assistant/MessageList";
import { useAssistantConversation } from "@/components/assistant/useAssistantConversation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast-context";
import { AssistantRequestError } from "@/lib/assistant/client/api";
import { composerChoice } from "@/lib/assistant/client/composer-choice";
import { PROVIDER_LABELS } from "@/lib/assistant/client/provider-label";
import { useAssistantSelection } from "@/lib/assistant/client/selection-store";
import { ASSISTANT_STOP_CORRECTION_MINUTES } from "@/lib/assistant/limits";
import { ACTIVE_RUN_STATUSES } from "@/lib/assistant/wire";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

type PanelProps = { close: () => void; open: boolean; project: string };
export function AssistantPanel({ close, open, project }: Readonly<PanelProps>) {
  const t = useTranslations("assistant");
  const { showToast } = useToast();
  const data = useAssistantConversation(project, open);
  const [selection, select] = useAssistantSelection(project);
  const [history, setHistory] = useState(false);
  const config = data.config.data;
  const choice = composerChoice(config, selection);
  const activeRun = data.current?.runs.find((run) => run.id === data.current?.activeRunId);
  const busy =
    data.streaming || Boolean(activeRun && ACTIVE_RUN_STATUSES.includes(activeRun.status));
  const disabledReason = !config?.enabled
    ? t(`errors.${config?.reason ?? "not_configured"}`)
    : !choice.model
      ? t("errors.model_unavailable")
      : null;
  const fundingHref = `${appPath(project, "providers")}#assistant-funding`;
  async function checkSetup() {
    try {
      const checked = await data.config.refetch();
      if (checked.isError || !checked.data) throw new Error("Setup unavailable");
      const next = composerChoice(checked.data, selection);
      const ready = checked.data.enabled && Boolean(next.model) && !next.fundingBlocked;
      showToast(t(ready ? "setup.ready" : "setup.notReady"), {
        severity: ready ? "success" : "warning",
      });
    } catch {
      showToast(t("setup.checkFailed"), { severity: "error" });
    }
  }
  function send(text: string | null, retry: string | null = null) {
    if (choice.model && !disabledReason && !choice.fundingBlocked && !busy)
      data.send(text, retry, choice.model.id, choice.effort, choice.maxOutputTokens);
  }
  const actions = config?.enabled ? (
    <>
      <Button
        aria-expanded={history}
        className="shrink-0"
        onClick={() => setHistory(!history)}
        size="input"
        variant="ghost"
      >
        {t("history")}
      </Button>
      <Button
        className="shrink-0"
        disabled={busy}
        onClick={() => {
          data.select(null);
          setHistory(false);
        }}
        size="input"
        variant="outline"
      >
        {t("newChat")}
      </Button>
    </>
  ) : null;
  return (
    <AssistantFrame actions={actions} close={close} open={open} subtitle={config?.project.name}>
      {data.config.isPending ? (
        <div className="space-y-2 p-3.5" role="status">
          <span className="sr-only">{t("loading")}</span>
          <div
            aria-hidden
            className="h-4 w-2/3 rounded-control bg-bg-sunken motion-safe:animate-pulse"
          />
          <div
            aria-hidden
            className="h-16 rounded-control bg-bg-sunken motion-safe:animate-pulse"
          />
        </div>
      ) : data.config.isError ? (
        <div className="p-3.5" role="alert">
          {data.config.error instanceof AssistantRequestError && data.config.error.detail
            ? t(`errors.${data.config.error.detail.code}`)
            : t("networkError")}{" "}
          <Button onClick={() => void data.config.refetch()} size="input" variant="outline">
            {t("networkRetry")}
          </Button>
        </div>
      ) : config && !config.enabled ? (
        <AssistantSetupState
          project={project}
          canManage={config.project.role === "admin" || config.project.role === "owner"}
          checking={data.config.isFetching}
          onCheck={() => void checkSetup()}
        />
      ) : config ? (
        <>
          {config.project.readOnly ? (
            <p className="m-0 px-3.5 pt-2 text-xs text-fg-muted">{t("readOnly")}</p>
          ) : null}
          {history ? (
            <div className="border-b border-border p-2">
              {data.history.isError ? (
                <Button onClick={() => void data.history.refetch()} size="input" variant="outline">
                  {t("networkRetry")}
                </Button>
              ) : data.history.isPending ? (
                <p className="m-0 p-1.5 text-sm">{t("loading")}</p>
              ) : data.history.data?.length ? (
                data.history.data.map((item) => (
                  <Button
                    className="justify-start"
                    disabled={busy}
                    fullWidth
                    key={item.id}
                    onClick={() => {
                      data.select(item.id);
                      setHistory(false);
                    }}
                    size="input"
                    variant="ghost"
                  >
                    <span className="min-w-0 truncate font-normal">{item.title}</span>
                  </Button>
                ))
              ) : (
                <p className="m-0 p-1.5 text-sm text-fg-muted">{t("emptyHistory")}</p>
              )}
            </div>
          ) : null}
          {data.conversation.isFetching && !data.current ? (
            <p className="m-0 p-3.5">{t("loading")}</p>
          ) : data.conversation.isError ? (
            <div className="p-3.5" role="alert">
              {t("networkError")}{" "}
              <Button
                onClick={() => void data.conversation.refetch()}
                size="input"
                variant="outline"
              >
                {t("networkRetry")}
              </Button>
            </div>
          ) : null}
          {!data.current?.messages.length && data.pendingText === null ? (
            <div className="flex flex-col items-start gap-2 p-3.5">
              <p className="m-0">{t("empty")}</p>
              {config.starters.map((starter) => (
                <Button
                  disabled={busy || Boolean(disabledReason)}
                  key={starter.id}
                  onClick={() => send(starter.prompt)}
                  size="input"
                  variant="outline"
                >
                  {starter.label}
                </Button>
              ))}
            </div>
          ) : null}
          <MessageList
            conversation={data.current}
            decide={data.decide}
            disabled={data.streaming}
            key={data.current?.id ?? "new"}
            pendingText={data.pendingText}
            retry={(run) => send(null, run)}
          />
          {data.error ? (
            <div className="px-3.5 text-sm" role="alert">
              {t(`errors.${data.error.code}`)}{" "}
              {data.error.code === "byok_missing" || data.error.code === "byok_invalid" ? (
                <Link href={fundingHref}>{t("fundingSettingsLink")}</Link>
              ) : null}
            </div>
          ) : null}
          {data.networkError ? (
            <div className="px-3.5 text-sm" role="alert">
              {t("networkError")}{" "}
              {data.canResubmit ? (
                <Button onClick={data.resubmit} size="input" variant="ghost">
                  {t("networkRetry")}
                </Button>
              ) : null}
            </div>
          ) : null}
          <div aria-live="polite" className="sr-only">
            {busy ? t("statuses.streaming") : activeRun ? t(`statuses.${activeRun.status}`) : ""}
          </div>
          {choice.fundingBlocked ? (
            <p className="m-0 px-3.5 pb-2 text-xs text-fg-muted">
              {t("fundingNotice")} <Link href={fundingHref}>{t("fundingSettingsLink")}</Link>
            </p>
          ) : null}
          <Composer
            blocked={choice.fundingBlocked}
            caption={
              busy && choice.funding?.mode === "credits"
                ? t("stopChargeNote", { minutes: String(ASSISTANT_STOP_CORRECTION_MINUTES) })
                : choice.model && choice.funding
                  ? `${PROVIDER_LABELS[choice.model.provider]} · ${
                      choice.funding.mode === "credits" ? t("paidWithCredits") : t("paidWithKey")
                    }`
                  : null
            }
            controls={
              <>
                <ModelSelect
                  config={config}
                  disabled={busy || !choice.models.length}
                  models={choice.models}
                  onChange={(modelId) => select({ modelId })}
                  project={project}
                  value={choice.model?.id ?? ""}
                />
                <EffortSelect
                  defaultEffort={choice.model?.defaultEffort ?? null}
                  disabled={busy}
                  efforts={choice.efforts}
                  onChange={(effort) => select({ effort })}
                  value={choice.effort}
                />
                <OutputLimitSelect
                  disabled={busy}
                  limits={choice.limits}
                  onChange={(maxOutputTokens) => select({ maxOutputTokens })}
                  value={choice.maxOutputTokens}
                />
              </>
            }
            disabledReason={disabledReason}
            limit={config.limits.maxUserTextChars}
            onSend={(text) => send(text)}
            onStop={data.stop}
            streaming={busy}
          />
        </>
      ) : null}
    </AssistantFrame>
  );
}
