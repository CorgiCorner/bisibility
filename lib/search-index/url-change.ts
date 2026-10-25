import type { IndexingUrl } from "./ui-model";

// First-inspection baselines are not tracked transitions.
export function latestTrackedChange(changes: NonNullable<IndexingUrl["history"]>["changes"]) {
  const latest = [...changes]
    .filter((change) => {
      const previous = change.previous;
      return previous && typeof previous === "object" && Object.keys(previous).length > 0;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
  if (!latest) return null;
  const verdict = (state: unknown) =>
    state && typeof state === "object" && "verdict" in state ? state.verdict : undefined;
  const before = verdict(latest.previous);
  const after = verdict(latest.next);
  const kind =
    before !== "PASS" && after === "PASS"
      ? "indexed"
      : before === "PASS" && after !== undefined && after !== "PASS"
        ? "dropped"
        : "changed";
  return { at: latest.at, kind } as const;
}
