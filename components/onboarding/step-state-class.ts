export function stepStateClass(done: boolean, active: boolean) {
  if (done) return "bg-green text-white";
  if (active) return "bg-accent text-white";
  return "bg-bg-sunken text-fg-faint";
}
