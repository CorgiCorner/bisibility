import {
  GlobeSimpleIcon as GlobeSimple,
  RocketLaunchIcon as RocketLaunch,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react/lib";

// This client-only facade imports Phosphor; server components must import label/status
// helpers from `workspace-labels.ts` directly.
export {
  type WorkspaceDisplayFacts,
  workspaceRowMeta,
  workspaceSublabel,
} from "@/components/shell/workspace-labels";

export type WorkspaceVisual = {
  Icon: Icon;
  tint: string;
  tintBg: string;
};

// Tints for non-primary workspaces, cycled by position so each row reads distinctly.
const TINTS: WorkspaceVisual[] = [
  {
    Icon: RocketLaunch,
    tint: "var(--purple)",
    tintBg: "color-mix(in srgb, var(--purple) 14%, transparent)",
  },
  {
    Icon: GlobeSimple,
    tint: "var(--blue)",
    tintBg: "color-mix(in srgb, var(--blue) 14%, transparent)",
  },
  {
    Icon: RocketLaunch,
    tint: "var(--green)",
    tintBg: "color-mix(in srgb, var(--green) 14%, transparent)",
  },
];

const PRIMARY: WorkspaceVisual = {
  Icon: GlobeSimple,
  tint: "var(--accent)",
  tintBg: "var(--accent-soft)",
};

/** Deterministic icon + tint for a workspace: the first row is the accent globe; the
 * rest cycle a small tint palette so the switcher generalizes past the seeded two. */
export function workspaceVisual(index: number): WorkspaceVisual {
  if (index === 0) {
    return PRIMARY;
  }
  return TINTS[(index - 1) % TINTS.length];
}
