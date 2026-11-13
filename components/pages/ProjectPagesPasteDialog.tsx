"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import type { AddManualProjectPagesResult } from "@/lib/pages/types";
import { useTranslations } from "next-intl";
import { useState } from "react";

const REASON_KEYS = {
  "Enter a URL or a path on this site.": "reasons.invalid",
  "Only 50,000 URLs can be added in one update.": "reasons.tooMany",
  "Paste at most 500 lines.": "reasons.tooManyLines",
  "This project has no site domain.": "reasons.missingDomain",
  "This URL is on another site.": "reasons.foreign",
} as const;

export function ProjectPagesPasteDialog({
  onAdded,
  onClose,
  onSubmit,
  open,
}: Readonly<{
  onAdded: () => void;
  onClose: () => void;
  onSubmit: (text: string) => Promise<AddManualProjectPagesResult>;
  open: boolean;
}>) {
  const t = useTranslations("projectPages");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AddManualProjectPagesResult | null>(null);

  async function submit() {
    setPending(true);
    try {
      const next = await onSubmit(text);
      setResult(next);
      if (next.added > 0) onAdded();
    } finally {
      setPending(false);
    }
  }

  function close() {
    setText("");
    setResult(null);
    onClose();
  }

  return (
    <Modal
      description={t("paste.description")}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={close} type="button" variant="ghost">
            {t("paste.cancel")}
          </Button>
          <Button
            disabled={pending || text.trim().length === 0}
            loading={pending}
            onClick={submit}
            type="button"
          >
            {t("paste.submit")}
          </Button>
        </div>
      }
      onClose={close}
      open={open}
      size="sm"
      title={t("paste.title")}
    >
      <div className="flex flex-col gap-3">
        <Textarea
          aria-label={t("paste.label")}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("paste.placeholder")}
          rows={8}
          value={text}
        />
        {result ? (
          <div className="flex flex-col gap-1 text-ui-caption" data-testid="pages-paste-result">
            <p>{t("paste.added", { count: result.added })}</p>
            <p>{t("paste.existing", { count: result.existing })}</p>
            {result.rejected.length > 0 ? (
              <>
                <p>{t("paste.rejected")}</p>
                <ul className="m-0 list-none p-0">
                  {result.rejected.map((item) => (
                    <li key={`${item.line}-${item.value}`}>
                      {t("paste.line", {
                        line: item.line,
                        reason: reasonLabel(item.reason, t),
                        value: item.value,
                      })}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function reasonLabel(reason: string, t: ReturnType<typeof useTranslations<"projectPages">>) {
  const key = REASON_KEYS[reason as keyof typeof REASON_KEYS];
  return key ? t(key) : reason;
}
