/** Shared geometry for tag chips and the inline adder input. */
export const tagChipClassName =
  "inline-flex h-7 max-w-full items-center gap-1 rounded-full border font-sans tabular-nums text-[11px] text-fg";

export const tagChipSurfaceClassName = "border-border bg-bg-sunken";

export const tagChipGhostClassName =
  "border-dashed border-border bg-transparent text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:bg-bg-sunken focus-visible:text-fg";

/** Morph + enter/exit for the inline tag adder shell. */
export const tagAdderShellMotionClassName =
  "origin-left transition-[transform,opacity,border-color,background-color] duration-[var(--motion-tooltip)] ease-[var(--ease-out)] motion-reduce:transition-[border-color,background-color] motion-reduce:duration-[var(--motion-tooltip)]";

/** Staggered affordances inside the editing chip (kbd, cancel). */
export const tagAdderAffordanceMotionClassName =
  "max-w-0 overflow-hidden p-0 opacity-0 scale-[0.97] transition-[transform,opacity,max-width,padding] duration-[var(--motion-tooltip)] ease-[var(--ease-out)] motion-reduce:scale-100 motion-reduce:opacity-100 motion-reduce:delay-0 data-[entered]:max-w-none data-[entered]:scale-100 data-[entered]:opacity-100";

export const tagAdderAffordanceEnterDelayKbdClassName =
  "delay-0 data-[entered]:px-0.5 data-[entered]:delay-[40ms]";
export const tagAdderAffordanceEnterDelayCancelClassName = "delay-0 data-[entered]:delay-[60ms]";

export const tagAdderInputMotionClassName =
  "transition-opacity duration-[var(--motion-menu-exit)] ease-[var(--ease-out)] motion-reduce:transition-none";
