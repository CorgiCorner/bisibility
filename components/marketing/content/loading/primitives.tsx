import type { CSSProperties } from "react";

type SkeletonTone = "accent" | "code" | "surface";

const surfaceGradient =
  "linear-gradient(90deg, var(--bg-sunken), var(--bg-inset), var(--bg-sunken))";

function skeletonBackground(tone: SkeletonTone) {
  if (tone === "accent") return "color-mix(in srgb, var(--accent) 26%, var(--bg-sunken))";
  if (tone === "code") return "color-mix(in srgb, var(--code-faint) 34%, var(--code-bg))";
  return surfaceGradient;
}

export function skeletonKeys(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

export function SkeletonBlock({
  className,
  style,
  tone = "surface",
}: Readonly<{
  className: string;
  style?: CSSProperties;
  tone?: SkeletonTone;
}>) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded bg-bg-sunken ${className}`}
      style={{ background: skeletonBackground(tone), ...style }}
    />
  );
}

export function EyebrowSkeleton({ width = 120 }: Readonly<{ width?: number }>) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="h-[2px] w-6 bg-accent" />
      <SkeletonBlock className="h-[13px]" style={{ width }} tone="accent" />
    </div>
  );
}

export function TextStack({ widths }: Readonly<{ widths: string[] }>) {
  return (
    <div className="flex flex-col gap-2.5">
      {widths.map((width) => (
        <SkeletonBlock className="h-[11px] rounded-[5px]" key={width} style={{ width }} />
      ))}
    </div>
  );
}

export function ActionSkeletons({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <div className="mt-[26px] flex flex-wrap gap-3">
      <SkeletonBlock className="h-[46px] rounded-[11px]" style={{ width: compact ? 132 : 168 }} />
      <SkeletonBlock className="h-[46px] rounded-[11px]" style={{ width: compact ? 116 : 142 }} />
    </div>
  );
}

export function ContentHeroSkeleton({
  actions = false,
  titleWidths = ["72%", "48%"],
}: Readonly<{
  actions?: boolean;
  titleWidths?: string[];
}>) {
  return (
    <section className="mx-auto max-w-[1080px] px-5 pb-9 pt-[42px] sm:px-8 sm:pb-10">
      <EyebrowSkeleton />
      <div className="mt-[18px] flex max-w-[760px] flex-col gap-3">
        {titleWidths.map((width) => (
          <SkeletonBlock
            className="h-[42px] rounded-[10px] sm:h-[50px]"
            key={width}
            style={{ width }}
          />
        ))}
      </div>
      <div className="mt-4 max-w-[640px]">
        <TextStack widths={["92%", "74%"]} />
      </div>
      {actions ? <ActionSkeletons /> : null}
    </section>
  );
}

export function CtaBandSkeleton() {
  return (
    <section className="mx-auto max-w-[1080px] px-5 pb-16 pt-4 sm:px-8">
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-bg-elev p-6 sm:p-8">
        <div className="w-full max-w-[720px]">
          <SkeletonBlock className="h-[31px] w-[72%] rounded-[8px]" />
          <div className="mt-4 max-w-[620px]">
            <TextStack widths={["100%", "66%"]} />
          </div>
        </div>
        <ActionSkeletons compact />
      </div>
    </section>
  );
}

export function DashboardPanelSkeleton() {
  const metrics = [
    { id: "metric-rank", width: "74%" },
    { id: "metric-change", width: "66%" },
    { id: "metric-share", width: "58%" },
  ];
  const chartBars = [
    { height: "42%", id: "bar-1", tone: "accent" as const },
    { height: "58%", id: "bar-2", tone: "surface" as const },
    { height: "46%", id: "bar-3", tone: "surface" as const },
    { height: "70%", id: "bar-4", tone: "accent" as const },
    { height: "61%", id: "bar-5", tone: "surface" as const },
    { height: "78%", id: "bar-6", tone: "surface" as const },
    { height: "66%", id: "bar-7", tone: "accent" as const },
    { height: "84%", id: "bar-8", tone: "surface" as const },
  ];

  return (
    <div className="rounded-[20px] border border-border bg-bg-elev p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <SkeletonBlock className="h-[12px] w-[108px]" />
          <SkeletonBlock className="mt-3 h-[27px] w-[174px] rounded-[8px]" />
        </div>
        <SkeletonBlock className="h-[38px] w-[116px] rounded-[10px]" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div className="rounded-[14px] border border-border bg-bg-sunken p-4" key={metric.id}>
            <SkeletonBlock className="h-[11px] w-[72px]" />
            <SkeletonBlock
              className="mt-4 h-[28px] rounded-[8px]"
              style={{ width: metric.width }}
            />
            <SkeletonBlock className="mt-3 h-[10px] w-[52%]" />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-[16px] border border-border bg-bg p-4">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-[14px] w-[128px]" />
          <SkeletonBlock className="h-[26px] w-[92px] rounded-full" />
        </div>
        <div className="mt-5 flex h-[170px] items-end gap-2">
          {chartBars.map((bar) => (
            <SkeletonBlock
              className="w-full rounded-t-[7px]"
              key={bar.id}
              style={{ height: bar.height }}
              tone={bar.tone}
            />
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-2.5">
        {["88%", "74%", "92%", "64%"].map((width) => (
          <div
            className="flex items-center gap-3 rounded-[12px] border border-border bg-bg p-3"
            key={width}
          >
            <SkeletonBlock className="size-8 rounded-[9px]" tone="accent" />
            <SkeletonBlock className="h-[12px] rounded-[6px]" style={{ width }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeatureCardSkeleton({ image = false }: Readonly<{ image?: boolean }>) {
  return (
    <div className="flex min-w-0 flex-col rounded-[15px] border border-border bg-bg-elev p-[22px]">
      {image ? (
        <SkeletonBlock className="mx-[-22px] mt-[-22px] mb-[18px] aspect-3/2 rounded-b-none rounded-t-[15px]" />
      ) : null}
      <SkeletonBlock className="h-[42px] w-[42px] rounded-[11px]" tone="accent" />
      <SkeletonBlock className="mt-4 h-[18px] w-[74%] rounded-[6px]" />
      <div className="mt-3">
        <TextStack widths={["96%", "82%", "58%"]} />
      </div>
      <SkeletonBlock className="mt-5 h-[13px] w-[104px]" tone="accent" />
    </div>
  );
}

export function CardGridSkeleton({
  count = 6,
  image = false,
}: Readonly<{ count?: number; image?: boolean }>) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {skeletonKeys("feature-card", count).map((key) => (
        <FeatureCardSkeleton image={image} key={key} />
      ))}
    </div>
  );
}
