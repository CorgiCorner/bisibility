import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";

type NewMarketSheetFooterProps = {
  cancelLabel: string;
  createDisabled: boolean;
  createLabel: string;
  onClose: () => void;
  pending: boolean;
  prospectiveCount?: number;
};

export function NewMarketSheetFooter({
  cancelLabel,
  createDisabled,
  createLabel,
  onClose,
  pending,
  prospectiveCount,
}: Readonly<NewMarketSheetFooterProps>) {
  const t = useTranslations("projectMarkets");
  return (
    <div className="grid gap-3">
      {prospectiveCount !== undefined ? (
        <>
          <p className="m-0 text-[12px] text-fg-muted">{t("creatingCostsNothing")}</p>
          <p className="m-0 text-[12px] text-fg-muted">
            {t("prospectiveKeywords", { count: prospectiveCount })}
          </p>
        </>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} onClick={onClose} size="sm" type="button" variant="ghost">
          {cancelLabel}
        </Button>
        <Button
          disabled={createDisabled}
          form="new-market-form"
          loading={pending}
          size="sm"
          type="submit"
          variant="secondary"
        >
          {createLabel}
        </Button>
      </div>
    </div>
  );
}
