"use client";

import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { movePresentationColumn } from "@/lib/saved-views/presentation-resolver";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

export function KeywordColumnOrderControl({
  columns,
  order,
  onChange,
}: Readonly<{
  columns: readonly { id: string; label: string }[];
  order: readonly string[];
  onChange: (order: readonly string[]) => void;
}>) {
  const t = useTranslations("shared.personalViews");
  const [selected, setSelected] = useState(columns[0]?.id ?? "");
  const control = useRef<HTMLFieldSetElement>(null);
  const index = order.indexOf(selected);
  function move(direction: "up" | "down", button: HTMLButtonElement) {
    onChange(movePresentationColumn(order, selected, direction));
    // The same stable button remains present after reordering; focus stays in this control.
    queueMicrotask(() => {
      if (control.current?.contains(button)) button.focus();
    });
  }
  if (!columns.length) return null;
  return (
    <fieldset
      ref={control}
      aria-label={t("columnOrder")}
      className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0"
    >
      <MenuSelect
        ariaLabel={t("columnOrder")}
        value={selected}
        onChange={setSelected}
        options={order.flatMap((id) => {
          const column = columns.find((item) => item.id === id);
          return column ? [{ value: id, label: column.label }] : [];
        })}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={index <= 0}
        onClick={(event) => move("up", event.currentTarget)}
      >
        {t("moveUp")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={index < 0 || index >= order.length - 1}
        onClick={(event) => move("down", event.currentTarget)}
      >
        {t("moveDown")}
      </Button>
    </fieldset>
  );
}
