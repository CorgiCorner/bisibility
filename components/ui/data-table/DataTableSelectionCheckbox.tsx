"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import type { ChangeEvent } from "react";
import type { DataTableSelectionState } from "./data-table-selection";

type DataTableSelectionCheckboxProps = DataTableSelectionState & {
  ariaLabel: string;
  onChange?: (checked: boolean) => void;
};

export function DataTableSelectionCheckbox({
  ariaLabel,
  checked,
  disabled,
  indeterminate,
  onChange,
}: Readonly<DataTableSelectionCheckboxProps>) {
  if (disabled) return null;
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange?.(event.target.checked);
  return (
    <Checkbox
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      checked={checked}
      disabled={!onChange}
      onChange={handleChange}
      onClick={(event) => event.stopPropagation()}
      ref={(node) => {
        if (node) node.indeterminate = indeterminate;
      }}
    />
  );
}
