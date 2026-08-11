import {
  EmptyModuleCard,
  EmptyModuleLabel,
} from "@/components/keyword-detail/empty/empty-state-primitives";

export function KeywordContextAllUnknown() {
  return (
    <EmptyModuleCard>
      <EmptyModuleLabel>Keyword context</EmptyModuleLabel>
      <p className="m-0 mt-3 text-[13px] leading-[1.5] text-fg-muted">
        Keyword metrics unavailable from this provider.
      </p>
    </EmptyModuleCard>
  );
}
