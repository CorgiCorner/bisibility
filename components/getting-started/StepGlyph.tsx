import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";

export function StepGlyph({
  blocked,
  done,
  skipped,
}: Readonly<{ blocked?: boolean; done: boolean; skipped?: boolean }>) {
  if (done || skipped) {
    return (
      <span
        aria-hidden
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full bg-fg-muted text-bg-elev ${skipped ? "opacity-65" : ""}`}
        data-testid={skipped ? "step-glyph-skipped" : "step-glyph-done"}
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
