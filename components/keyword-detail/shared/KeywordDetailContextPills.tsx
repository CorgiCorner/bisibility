import {
  ListBulletsIcon as ListBullets,
  MapPinIcon as MapPin,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react";

export type KeywordDetailContextPillsProps = {
  depth: number;
  device: string;
  location: string;
};

type ContextPillProps = {
  children: string;
  icon: typeof MapPin;
};

function ContextPill({ children, icon: Icon }: Readonly<ContextPillProps>) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-sunken px-2.5 py-1 text-[12px] font-medium text-fg">
      <Icon aria-hidden className="text-fg-muted" size={13} weight="bold" />
      <span>{children}</span>
    </span>
  );
}

export function KeywordDetailContextPills({
  depth,
  device,
  location,
}: Readonly<KeywordDetailContextPillsProps>) {
  return (
    <div aria-label="Keyword context" className="flex flex-wrap items-center gap-[7px]">
      <ContextPill icon={MapPin}>{location}</ContextPill>
      <ContextPill icon={Monitor}>{device}</ContextPill>
      <ContextPill icon={ListBullets}>{`Top ${depth}`}</ContextPill>
    </div>
  );
}
