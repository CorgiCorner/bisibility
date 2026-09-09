export type SetupProgressRingProps = Readonly<{
  settledCount: number;
  size?: 20 | 22;
  totalCount: number;
}>;

const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function setupProgressArc(settledCount: number, totalCount: number) {
  const ratio = totalCount > 0 ? Math.min(1, Math.max(0, settledCount / totalCount)) : 0;
  return {
    arcLength: (CIRCUMFERENCE * ratio).toFixed(1),
    circumference: CIRCUMFERENCE.toFixed(1),
  };
}

export function SetupProgressRing({ settledCount, size = 22, totalCount }: SetupProgressRingProps) {
  const { arcLength, circumference } = setupProgressArc(settledCount, totalCount);

  return (
    <svg aria-hidden data-progress-ring height={size} viewBox="0 0 20 20" width={size}>
      <circle cx="10" cy="10" fill="none" r={RADIUS} stroke="var(--bg-inset)" strokeWidth="3" />
      <circle
        cx="10"
        cy="10"
        data-progress-arc
        fill="none"
        r={RADIUS}
        stroke="var(--accent-solid)"
        strokeDasharray={`${arcLength} ${circumference}`}
        strokeLinecap="round"
        strokeOpacity={arcLength === "0.0" ? 0 : 1}
        strokeWidth="3"
        transform="rotate(-90 10 10)"
      />
    </svg>
  );
}
