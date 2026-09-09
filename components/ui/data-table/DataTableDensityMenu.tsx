"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { ListIcon as List } from "@phosphor-icons/react/dist/csr/List";
import { ListDashesIcon as ListDashes } from "@phosphor-icons/react/dist/csr/ListDashes";
import { RowsIcon as Rows } from "@phosphor-icons/react/dist/csr/Rows";
import type { DataTableDensity, DataTableDensityMenuProps } from "./data-table-types";

const options = [
  {
    icon: <ListDashes aria-hidden size={14} weight="regular" />,
    label: "Compact",
    value: "compact",
  },
  { icon: <List aria-hidden size={14} weight="regular" />, label: "Standard", value: "standard" },
  {
    icon: <Rows aria-hidden size={14} weight="regular" />,
    label: "Comfortable",
    value: "comfortable",
  },
] satisfies { icon: React.ReactNode; label: string; value: DataTableDensity }[];

export function DataTableDensityMenu({
  ariaLabel = "Table density",
  density,
  onDensityChange,
}: Readonly<DataTableDensityMenuProps>) {
  return (
    <MenuSelect
      ariaLabel={ariaLabel}
      leadingIcon={<Rows aria-hidden size={15} weight="regular" />}
      menuMinWidth={180}
      onChange={(value) => onDensityChange(value as DataTableDensity)}
      options={options}
      value={density}
    />
  );
}
