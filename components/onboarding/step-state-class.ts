export function stepStateClass(done: boolean, active: boolean) {
  if (done) return "bg-green-text text-primary-contrast";
  if (active) return "bg-accent-solid text-primary-contrast";
  return "bg-bg-sunken text-fg-muted";
}
