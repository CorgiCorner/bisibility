export type NewMarketTargetUrlInput = {
  defaultLocationKey: string | null | undefined;
  pastedUrl: string | null | undefined;
  rowLocationKey: string;
};

export function targetUrlForNewMarketRow(input: NewMarketTargetUrlInput) {
  if (!input.pastedUrl || !input.defaultLocationKey) return null;
  return input.defaultLocationKey === input.rowLocationKey ? input.pastedUrl : null;
}
