import type { ComponentPropsWithoutRef } from "react";

export type MarketLabelProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  device: string;
  location: string;
  marketName?: string | null;
};

export function MarketLabel({
  device,
  location,
  marketName,
  ...props
}: Readonly<MarketLabelProps>) {
  const customName = marketName?.trim();
  return <span {...props}>{customName || `${location} / ${device}`}</span>;
}
