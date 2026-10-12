/** A 30px quiet icon control for a panel header: the modal close and the card expand buttons. */
export const headerIconButtonClassName =
  "grid h-7.5 w-7.5 shrink-0 place-items-center rounded-control text-fg-muted outline-none transition-[color,background-color,transform] duration-(--motion-press) hover:bg-bg-sunken focus-visible:bg-bg-sunken focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent-solid focus-visible:outline-offset-2 motion-reduce:transition-none motion-safe:active:not-focus-visible:scale-[0.97]";

/** Quiet shell utilities, distinct from workspace primary actions. */
export const headerUtilityControlClassName =
  "cursor-pointer border border-border bg-transparent text-fg transition-colors hover:border-border-control hover:bg-bg-band focus-visible:bg-bg-band focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent-solid focus-visible:outline-offset-2 aria-expanded:border-border-control aria-expanded:bg-bg-band motion-reduce:transition-none";
