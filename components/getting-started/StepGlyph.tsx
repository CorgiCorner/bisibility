import { CheckIcon as Check } from "@phosphor-icons/react";

export function StepGlyph({ blocked, done }: Readonly<{ blocked?: boolean; done: boolean }>) {
  if (done) {
    return (
      <span
        aria-hidden
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-fg-muted text-bg-elev"
        data-testid="step-glyph-done"
      >
        <Check data-testid="step-check" size={11} weight="regular" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`h-5 w-5 shrink-0 rounded-full border-[1.5px] border-border-control ${blocked ? "border-dashed" : ""}`}
      data-testid={blocked ? "step-glyph-blocked" : "step-glyph-open"}
    />
  );
}
