"use client";

import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { Button, Card, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import { type ReactNode, useRef, useState } from "react";

export type SettingsCardState = {
  dirty: boolean;
  markDirty: () => void;
};

type SettingsCardProps = {
  children: ReactNode | ((state: SettingsCardState) => ReactNode);
  className?: string;
  description?: string;
  onSave?: () => void | Promise<void>;
  showSave?: boolean;
  title: string;
};

function cardContents(
  children: SettingsCardProps["children"],
  state: SettingsCardState,
): ReactNode {
  return typeof children === "function" ? children(state) : children;
}

export function SettingsCard({
  children,
  className,
  description,
  onSave,
  showSave = true,
  title,
}: Readonly<SettingsCardProps>) {
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const savedTimer = useRef<number | null>(null);

  function markDirty() {
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    if (!dirty || saving) return;

    setSaving(true);
    try {
      await onSave?.();
      setDirty(false);
      setSaved(true);
      savedTimer.current = window.setTimeout(() => setSaved(false), 2_500);
    } finally {
      setSaving(false);
    }
  }

  const state = { dirty, markDirty };

  return (
    <Card
      className={cn(settingsCardFrameClassName, className)}
      data-settings-card=""
      data-settings-card-frame="settled"
      onChangeCapture={markDirty}
      size="lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <SectionTitle>{title}</SectionTitle>
          {description ? (
            <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-fg-muted">{description}</p>
          ) : null}
        </div>
        {showSave ? (
          <div className="flex min-h-9 items-center gap-3">
            <span aria-live="polite" className="text-[12px] font-medium text-green-text">
              {saved ? <span data-settings-card-saved="">Saved</span> : null}
            </span>
            <Button
              data-settings-card-save=""
              disabled={!dirty}
              loading={saving}
              onClick={save}
              size="sm"
            >
              Save
            </Button>
          </div>
        ) : null}
      </div>
      <div className="mt-5">{cardContents(children, state)}</div>
    </Card>
  );
}
