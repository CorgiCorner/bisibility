"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { ListIcon as List } from "@phosphor-icons/react/dist/csr/List";
import { ListDashesIcon as ListDashes } from "@phosphor-icons/react/dist/csr/ListDashes";
import { RowsIcon as Rows } from "@phosphor-icons/react/dist/csr/Rows";
import { useTranslations } from "next-intl";
import type { DataTableDensity, DataTableDensityMenuProps } from "./data-table-types";

export function DataTableDensityMenu({
  ariaLabel,
  density,
  onDensityChange,
}: Readonly<DataTableDensityMenuProps>) {
  const t = useTranslations("shared.controls.dataTable");
  const options = [
    {
      icon: <ListDashes aria-hidden size={14} weight="regular" />,
      label: t("compact"),
      value: "compact",
    },
    {
      icon: <List aria-hidden size={14} weight="regular" />,
      label: t("standard"),
      value: "standard",
    },
    {
      icon: <Rows aria-hidden size={14} weight="regular" />,
      label: t("comfortable"),
      value: "comfortable",
    },
  ] satisfies { icon: React.ReactNode; label: string; value: DataTableDensity }[];

  return (
    <MenuSelect
      ariaLabel={ariaLabel ?? t("density")}
      leadingIcon={<Rows aria-hidden size={15} weight="regular" />}
      menuMinWidth={180}
      onChange={(value) => onDensityChange(value as DataTableDensity)}
      options={options}
      value={density}
    />
  );
}
