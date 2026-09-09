import { Button } from "@/components/ui/Button";

type NewMarketSheetFooterProps = {
  createDisabled: boolean;
  onClose: () => void;
  pending: boolean;
  prospectiveCount?: number;
};

export function NewMarketSheetFooter({
  createDisabled,
  onClose,
  pending,
  prospectiveCount,
}: Readonly<NewMarketSheetFooterProps>) {
  return (
    <div className="grid gap-3">
      {prospectiveCount !== undefined ? (
        <>
          <p className="m-0 text-[12px] text-fg-muted">
            Creating the market spends nothing. Pick how it gets its keywords.
          </p>
          <p className="m-0 text-[12px] text-fg-muted">
            {prospectiveCount} prospective {prospectiveCount === 1 ? "keyword" : "keywords"}
          </p>
        </>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} onClick={onClose} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
        <Button
          disabled={createDisabled}
          form="new-market-form"
          loading={pending}
          size="sm"
          type="submit"
          variant="secondary"
        >
          Create market
        </Button>
      </div>
    </div>
  );
}
