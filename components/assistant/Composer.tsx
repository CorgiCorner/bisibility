"use client";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { StopIcon } from "@phosphor-icons/react/dist/csr/Stop";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

type ComposerProps = {
  limit: number;
  streaming: boolean;
  disabledReason: string | null;
  /** Disables the composer without a second explanation, when a notice already says why. */
  blocked?: boolean;
  /** Model and effort selects, rendered inside the field in the row with the send button. */
  controls?: ReactNode;
  /** Provider and who pays, shown under the field before the character count. */
  caption?: string | null;
  onSend: (text: string) => void;
  onStop: () => void;
};

export function Composer({
  limit,
  streaming,
  disabledReason,
  blocked = false,
  controls,
  caption,
  onSend,
  onStop,
}: Readonly<ComposerProps>) {
  const t = useTranslations("assistant");
  const [text, setText] = useState("");
  function send() {
    const value = text.trim();
    if (!value || disabledReason || blocked || streaming) return;
    onSend(value);
    setText("");
  }
  const count = t("characterCount", { count: String(text.length), limit: String(limit) });
  return (
    <div className="flex flex-col gap-2 border-t border-border px-3.5 py-3 max-sm:px-4 max-sm:pb-4">
      {disabledReason ? <p className="m-0 text-xs text-fg-muted">{disabledReason}</p> : null}
      <div
        className="flex flex-col rounded-card border border-border-control bg-bg transition-colors focus-within:border-accent"
        data-composer-field=""
      >
        <Textarea
          aria-label={t("input")}
          className="max-h-40 min-h-0 border-0 bg-transparent px-3 py-2.5 focus:border-0 disabled:border-0 disabled:bg-transparent"
          disabled={Boolean(disabledReason) || blocked || streaming}
          maxLength={limit}
          onChange={(event) => {
            setText(event.target.value);
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`;
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.nativeEvent.keyCode !== 229
            ) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={t("placeholder")}
          resize="none"
          rows={2}
          value={text}
        />
        <div className="flex min-w-0 items-center gap-1.5 px-2 pb-2 pt-1" data-composer-controls="">
          {controls}
          {streaming ? (
            <Button
              aria-label={t("stop")}
              className="ml-auto min-w-0 shrink-0"
              onClick={onStop}
              size="input"
              variant="secondary"
            >
              <StopIcon aria-hidden size={16} weight="regular" />
            </Button>
          ) : (
            <Button
              aria-label={t("send")}
              className="ml-auto min-w-0 shrink-0"
              disabled={!text.trim() || Boolean(disabledReason) || blocked}
              onClick={send}
              size="input"
            >
              <ArrowUpIcon aria-hidden size={16} weight="regular" />
            </Button>
          )}
        </div>
      </div>
      <p className="m-0 text-xs text-fg-muted">{caption ? `${caption} · ${count}` : count}</p>
    </div>
  );
}
