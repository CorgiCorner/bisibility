"use client";

import type { ProviderIconName } from "@/lib/integrations/types";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/dist/csr/ChartBar";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/csr/Database";
import { GlobeHemisphereWestIcon as GlobeHemisphereWest } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";
import { LinkIcon as Link } from "@phosphor-icons/react/dist/csr/Link";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { TableIcon as Table } from "@phosphor-icons/react/dist/csr/Table";
import { TrendUpIcon as TrendUp } from "@phosphor-icons/react/dist/csr/TrendUp";
import { useState } from "react";
import { buildLogoDevUrl } from "./provider-logo-url";

export type ProviderLogoProps = {
  alt: string;
  domain?: string | null;
  fallbackIcon: ProviderIconName;
  size?: "default" | "sm";
  tint: string;
};

const icons = {
  chart: ChartBar,
  database: Database,
  globe: GlobeHemisphereWest,
  link: Link,
  magnifier: MagnifyingGlass,
  table: Table,
  trend: TrendUp,
} as const satisfies Record<ProviderIconName, typeof ChartBar>;

export function ProviderLogo({
  alt,
  domain,
  fallbackIcon,
  size = "default",
  tint,
}: Readonly<ProviderLogoProps>) {
  const [failed, setFailed] = useState(false);
  const FallbackIcon = icons[fallbackIcon];
  const src = failed
    ? null
    : buildLogoDevUrl({
        domain,
        token: process.env.NEXT_PUBLIC_LOGODEV_TOKEN,
      });

  return (
    <span
      aria-label={alt}
      className={
        size === "sm"
          ? "grid h-[38px] w-[38px] shrink-0 place-items-center rounded-control bg-bg-elev"
          : "grid h-[46px] w-[46px] shrink-0 place-items-center rounded-control bg-bg-sunken"
      }
      role="img"
      style={{ color: tint }}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: Logo.dev URLs are dynamic and require an onError fallback.
        <img
          alt=""
          className={
            size === "sm"
              ? "h-6 w-6 rounded-control bg-white object-contain"
              : "h-8 w-8 rounded-control bg-white object-contain"
          }
          decoding="async"
          height={size === "sm" ? 24 : 32}
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
          src={src}
          width={size === "sm" ? 24 : 32}
        />
      ) : (
        <FallbackIcon aria-hidden size={size === "sm" ? 19 : 23} weight="regular" />
      )}
    </span>
  );
}
