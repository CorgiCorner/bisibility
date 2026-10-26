export function ActionPaymentLoading({ label }: Readonly<{ label: string }>) {
  return (
    <div role="status" aria-live="polite" className="grid gap-3">
      <p className="m-0 text-ui-xs text-fg-muted">{label}</p>
      <div
        aria-hidden
        data-payment-skeleton
        className="grid gap-2 rounded-card border border-border p-3 motion-safe:animate-pulse"
      >
        <div className="h-4 w-36 max-w-full rounded-control bg-bg-sunken" />
        <div className="h-4 w-48 max-w-full rounded-control bg-bg-sunken" />
        <div className="h-5 w-24 rounded-control bg-bg-sunken" />
        <div className="h-4 w-full rounded-control bg-bg-sunken" />
      </div>
    </div>
  );
}
