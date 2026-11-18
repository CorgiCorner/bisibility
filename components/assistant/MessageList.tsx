"use client";

import { RunCost } from "@/components/assistant/RunCost";
import { SafeMarkdown } from "@/components/assistant/SafeMarkdown";
import { ToolCard } from "@/components/assistant/ToolCard";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import type { ConversationView, MessageView, RunView, ToolCallView } from "@/lib/assistant/wire";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";

/** A MutationObserver syncs the external scroll position without moving focus during streaming. */
function useMessageScroll() {
  const node = useRef<HTMLDivElement | null>(null);
  const observer = useRef<MutationObserver | null>(null);
  const near = useRef(true);
  const [away, setAway] = useState(false);
  const attach = useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect();
    node.current = element;
    if (!element) return;
    observer.current = new MutationObserver(() => {
      if (near.current) element.scrollTop = element.scrollHeight;
    });
    observer.current.observe(element, { childList: true, characterData: true, subtree: true });
    element.scrollTop = element.scrollHeight;
  }, []);
  function onScroll() {
    const element = node.current;
    if (!element) return;
    near.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
    setAway(!near.current);
  }
  function jump() {
    if (node.current) {
      node.current.scrollTop = node.current.scrollHeight;
      near.current = true;
      setAway(false);
    }
  }
  return { attach, onScroll, away, jump };
}

const retryBlocked = new Set(["limit_exceeded", "credits_insufficient"]);

function runMessages(messages: readonly MessageView[], runId: string) {
  return messages.filter((message) => message.runId === runId);
}

/** Last assistant message of the run, or the last message when the run never produced one. */
function runAnchor(messages: readonly MessageView[], runId: string) {
  const related = runMessages(messages, runId);
  return (related.filter((message) => message.role === "assistant").at(-1) ?? related.at(-1))?.id;
}

function assistantCarriesError(messages: readonly MessageView[], runId: string) {
  return runMessages(messages, runId).some(
    (message) =>
      message.role === "assistant" && message.parts.some((part) => part.type === "notice"),
  );
}

function showRunReason(message: MessageView, run: RunView, messages: readonly MessageView[]) {
  return (
    message.id === runAnchor(messages, run.id) &&
    (run.status === "failed" || run.status === "cancelled") &&
    run.error !== null &&
    !assistantCarriesError(messages, run.id)
  );
}

export function MessageList({
  conversation,
  decide,
  retry,
  disabled = false,
  pendingText = null,
}: Readonly<{
  conversation: ConversationView | null;
  disabled?: boolean;
  /** Submitted text shown until the server confirms the run; "" for a retry. */
  pendingText?: string | null;
  decide: (call: ToolCallView, decision: "approve" | "deny") => Promise<void>;
  retry: (id: string) => void;
}>) {
  const t = useTranslations("assistant");
  const scroll = useMessageScroll();
  return (
    <div className="relative min-h-0 flex-1">
      <div
        className="h-full overflow-y-auto overscroll-contain p-3"
        onScroll={scroll.onScroll}
        ref={scroll.attach}
      >
        <div className="space-y-4">
          {conversation?.messages.map((message) => {
            const text = message.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n");
            const run = conversation.runs.find((item) => item.id === message.runId);
            return (
              <article
                className={
                  message.role === "user" ? "rounded-control bg-accent-soft p-3" : "space-y-2"
                }
                key={message.id}
              >
                {message.parts.map((part, index) =>
                  part.type === "text" ? (
                    <SafeMarkdown key={index} text={part.text} />
                  ) : part.type === "tool" ? (
                    <ToolCard
                      call={part.call}
                      decide={decide}
                      disabled={disabled}
                      key={part.call.id}
                    />
                  ) : (
                    <p key={index} role="status">
                      {t(`errors.${part.code}`)}
                    </p>
                  ),
                )}
                {message.role === "assistant" && text ? (
                  <CopyButton label={t("copy")} text={text} />
                ) : null}
                {message.partial ? <p className="text-xs text-fg-muted">{t("partial")}</p> : null}
                {message.role === "assistant" &&
                run &&
                message.id === runAnchor(conversation.messages, run.id) ? (
                  <RunCost run={run} />
                ) : null}
                {run && showRunReason(message, run, conversation.messages) && run.error ? (
                  <p role="status">{t(`errors.${run.error.code}`)}</p>
                ) : null}
                {message.role === "assistant" &&
                message.id === runAnchor(conversation.messages, run?.id ?? "") &&
                run?.usageUncertain ? (
                  <p className="text-xs text-fg-muted">{t("errors.usage_unknown")}</p>
                ) : null}
                {message.role === "assistant" &&
                run &&
                message.id === runAnchor(conversation.messages, run.id) &&
                (run.status === "failed" || run.status === "cancelled") &&
                !retryBlocked.has(run.error?.code ?? "") ? (
                  <Button onClick={() => retry(run.id)} type="button" variant="ghost">
                    {t("retry")}
                  </Button>
                ) : null}
              </article>
            );
          })}
          {pendingText !== null ? (
            <div className="space-y-2">
              {pendingText ? (
                <p className="whitespace-pre-wrap rounded-control bg-accent-soft p-3 text-sm">
                  {pendingText}
                </p>
              ) : null}
              <p className="text-xs text-fg-muted motion-safe:animate-pulse">
                {t("statuses.pending")}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      {scroll.away ? (
        <Button className="absolute bottom-2 right-3" onClick={scroll.jump} type="button">
          {t("jump")}
        </Button>
      ) : null}
    </div>
  );
}
