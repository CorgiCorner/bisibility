"use client";

import { Calendar } from "@/components/ui/Calendar";
import { Popup as Popover } from "@/components/ui/Popup";
import { zonedDateInputValue } from "@/lib/checks/date-boundary";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";

type AsOfDatePopoverProps = {
  anchorEl: HTMLElement | null;
  now: Date;
  onClose: () => void;
  onSelect: (date: string) => void;
  selectedDate: string;
  timeZone: string;
};

export function AsOfDatePopover({
  anchorEl,
  now,
  onClose,
  onSelect,
  selectedDate,
  timeZone,
}: Readonly<AsOfDatePopoverProps>) {
  const maxDate = zonedDateInputValue(now, timeZone);

  function selectDate(date: string) {
    onSelect(date);
    onClose();
  }

  return (
    <Popover
      anchorEl={anchorEl}
      align="end"
      side="bottom"
      onClose={onClose}
      open={Boolean(anchorEl)}
      contentProps={{
        "aria-label": "As of date",
        role: "dialog",
        style: {
          backgroundColor: "var(--bg-elev)",
          border: "1px solid var(--border)",
          borderRadius: UI_RADIUS_ROLES.card,
          boxShadow: "none",
          marginTop: "6px",
          overflow: "hidden",
        },
      }}
    >
      <div className="w-[292px] bg-bg-elev p-3.5 text-fg">
        <Calendar
          ariaLabel="Choose as of date"
          max={maxDate}
          onChange={selectDate}
          value={selectedDate}
        />
        <p className="mb-0 mt-4 border-border border-t pt-3 font-sans tabular-nums text-[10.5px] leading-relaxed text-fg-muted">
          Dates use the project timezone ({timeZone}).
        </p>
      </div>
    </Popover>
  );
}
