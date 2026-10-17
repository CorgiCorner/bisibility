/** Match the existing context control height without claiming a previous market selection. */
export function HeaderContextLoading() {
  return (
    <div aria-hidden className="flex h-8 min-w-0 items-center" data-testid="header-context-loading">
      <div className="h-8 w-40 max-w-full rounded-control bg-bg-sunken motion-safe:animate-pulse" />
    </div>
  );
}
