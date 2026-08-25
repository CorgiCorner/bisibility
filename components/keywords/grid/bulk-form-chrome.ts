export type BulkFormChrome = {
  formId?: string;
  hideSubmit?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export async function runBulkFormBusy(
  onBusyChange: ((busy: boolean) => void) | undefined,
  work: () => Promise<void>,
) {
  onBusyChange?.(true);
  try {
    await work();
  } finally {
    onBusyChange?.(false);
  }
}
