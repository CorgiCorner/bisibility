/** One wording for every surface that refuses a market this project does not track. */
export function untrackedMarketMessage(marketName: string) {
  return `Market ${marketName} is not tracked by this project. Add it in Markets first.`;
}

/**
 * Archiving a market is terminal for implicit writes: a keyword write or a repeated create
 * refuses instead of reviving the row, so only an explicit restore brings the market back.
 */
export class MarketArchivedError extends Error {
  readonly marketName: string;

  constructor(marketName: string) {
    super(untrackedMarketMessage(marketName));
    this.name = "MarketArchivedError";
    this.marketName = marketName;
  }
}

/**
 * The one-time note the markets route shows after a reader opened an archived market's URL.
 * The market id is echoed because the reader arrived from a link that named it.
 */
export function archivedMarketNote(marketRef: string) {
  return `Market ${marketRef} is archived, so its pages are closed. Restore it to open them again.`;
}
