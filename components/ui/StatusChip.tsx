import { cn } from "@/lib/ui/cn";
import type { Icon } from "@phosphor-icons/react";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { PauseIcon as Pause } from "@phosphor-icons/react/dist/ssr/Pause";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/dist/ssr/SealCheck";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";

export type StatusChipTone =
  | "neutral"
  | "info"
  | "positive"
  | "attention"
  | "critical"
  | "accent"
  | "planned";
export type StatusChipVariant = "soft" | "outline" | "solid";
export type StatusChipSize = "sm" | "md";
export type StatusChipShape = "pill" | "square";

export type StatusChipProps = {
  label: string;
  tone?: StatusChipTone;
  variant?: StatusChipVariant;
  size?: StatusChipSize;
  shape?: StatusChipShape;
  dot?: boolean;
  pulse?: boolean;
  icon?: string;
  live?: boolean;
};

type ToneStyle = { dot: string; hue: string; text: string; fill: number; line: number };

const TONE_STYLES = {
  neutral: {
    dot: "var(--fg-muted)",
    hue: "var(--fg)",
    text: "var(--fg-muted)",
    fill: 6,
    line: 17,
  },
  info: {
    dot: "var(--blue)",
    hue: "var(--blue)",
    text: "var(--blue-text)",
    fill: 12,
    line: 28,
  },
  positive: {
    dot: "var(--green)",
    hue: "var(--green)",
    text: "var(--green-text)",
    fill: 12,
    line: 28,
  },
  attention: {
    dot: "var(--yellow)",
    hue: "var(--yellow)",
    text: "var(--yellow-text)",
    fill: 12,
    line: 28,
  },
  critical: {
    dot: "var(--red)",
    hue: "var(--red)",
    text: "var(--red-text)",
    fill: 12,
    line: 28,
  },
  accent: {
    dot: "var(--accent-solid)",
    hue: "var(--accent-solid)",
    text: "var(--accent-text)",
    fill: 12,
    line: 28,
  },
  planned: {
    dot: "var(--purple)",
    hue: "var(--purple)",
    text: "var(--purple)",
    fill: 12,
    line: 28,
  },
} as const satisfies Record<StatusChipTone, ToneStyle>;

const STATUS_ICONS = {
  "check-circle": CheckCircle,
  pause: Pause,
  "seal-check": SealCheck,
  "warning-circle": WarningCircle,
} satisfies Record<string, Icon>;

const sizeClasses = {
  sm: "h-5 gap-[5px] px-[7px] text-[11px] tracking-[.01em]",
  md: "h-6 gap-1.5 px-[9px] text-[12.5px] tracking-normal",
} satisfies Record<StatusChipSize, string>;

const iconSizes = { sm: 12, md: 14 } satisfies Record<StatusChipSize, number>;
const dotClasses = { sm: "h-[5px] w-[5px]", md: "h-1.5 w-1.5" } satisfies Record<
  StatusChipSize,
  string
>;

function colorMix(hue: string, percentage: number): string {
  return `color-mix(in srgb, ${hue} ${percentage}%, var(--bg-elev))`;
}

function iconFor(name: string): Icon {
  const normalized = name.replace(/^ph-/, "");
  const icon = STATUS_ICONS[normalized as keyof typeof STATUS_ICONS];
  if (!icon) throw new Error(`Unknown status chip icon: ${name}`);
  return icon;
}

export function StatusChip({
  label,
  tone = "positive",
  variant = "soft",
  size = "sm",
  shape = "pill",
  dot = true,
  pulse = false,
  icon = "",
  live = false,
}: Readonly<StatusChipProps>) {
  const toneStyle = TONE_STYLES[tone];
  const solid = variant === "solid";
  const StatusIcon = icon ? iconFor(icon) : null;
  const renderedLabel = label || "Status";
  const backgroundColor = solid
    ? toneStyle.hue
    : variant === "outline"
      ? "transparent"
      : colorMix(toneStyle.hue, toneStyle.fill);

  return (
    <>
      <style href="status-chip-breathe" precedence="medium">{`
        @keyframes status-chip-breathe { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
        .status-chip-breathe { animation: status-chip-breathe 1.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .status-chip-breathe { animation: none; } }
      `}</style>
      <span
        aria-label={live ? renderedLabel : undefined}
        data-status-chip-tone={tone}
        className={cn(
          "box-border inline-flex items-center whitespace-nowrap border font-sans font-medium leading-none tabular-nums",
          sizeClasses[size],
          shape === "square" ? "rounded-control" : "rounded-full",
        )}
        role={live ? "status" : undefined}
        style={{
          backgroundColor,
          borderColor: solid ? toneStyle.hue : colorMix(toneStyle.hue, toneStyle.line),
          color: solid ? "var(--accent-on-solid)" : toneStyle.text,
        }}
      >
        {!StatusIcon && dot ? (
          <span
            aria-hidden
            className={cn(
              "shrink-0 rounded-full",
              dotClasses[size],
              pulse && "status-chip-breathe",
            )}
            data-status-chip-dot
            data-testid="status-chip-dot"
            style={{ backgroundColor: solid ? "var(--accent-on-solid)" : toneStyle.dot }}
          />
        ) : null}
        {StatusIcon ? (
          <StatusIcon
            aria-hidden
            className="-ml-px shrink-0"
            data-icon-weight="regular"
            data-status-chip-icon={icon}
            data-testid="status-chip-icon"
            size={iconSizes[size]}
            weight="regular"
          />
        ) : null}
        <span>{renderedLabel}</span>
      </span>
    </>
  );
}
