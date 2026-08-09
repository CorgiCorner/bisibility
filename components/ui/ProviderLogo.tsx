"use client";

import type { ProviderIconName } from "@/lib/integrations/types";
import {
  ChartBarIcon as ChartBar,
  DatabaseIcon as Database,
  GlobeHemisphereWestIcon as GlobeHemisphereWest,
  LinkIcon as Link,
  MagnifyingGlassIcon as MagnifyingGlass,
  TableIcon as Table,
  TrendUpIcon as TrendUp,
} from "@phosphor-icons/react";
import { useState } from "react";
import { buildLogoDevUrl } from "./provider-logo-url";

export type ProviderLogoProps = {
  alt: string;
  domain?: string | null;
  fallbackIcon: ProviderIconName;
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

export function ProviderLogo({ alt, domain, fallbackIcon, tint }: Readonly<ProviderLogoProps>) {
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
      className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[11px] bg-bg-sunken"
      style={{ color: tint }}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: Logo.dev URLs are dynamic and require an onError fallback.
        <img
          alt={alt}
          className="h-8 w-8 rounded-lg bg-white object-contain"
          decoding="async"
          height={32}
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
          src={src}
          width={32}
        />
      ) : (
        <FallbackIcon aria-hidden size={23} weight="fill" />
      )}
    </span>
  );
}
