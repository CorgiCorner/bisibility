import type { UpcomingForecast } from "@/lib/checks/contract";
import { formatCap, formatEstimatedCost, formatForecastDate } from "./upcoming-format";

export type BudgetForecastNoteProps = {
  forecast: UpcomingForecast | null;
};

// A small, muted note. Only the amounts and dates are emphasised (semibold, full
// contrast); the surrounding prose stays quiet at ~12px per the design.
export function BudgetForecastNote({ forecast }: Readonly<BudgetForecastNoteProps>) {
  if (!forecast) return null;

  const cap = formatCap(forecast.capCents);
  const next48h = formatEstimatedCost(forecast.next48hCents);

  return (
    <p className="m-0 text-[12px] leading-relaxed text-fg-muted">
      {forecast.capLastsUntil ? (
        <>
          At the current daily rate the <strong className="font-semibold text-fg">{cap} cap</strong>{" "}
          lasts until{" "}
          <strong className="font-semibold text-fg">
            ~{formatForecastDate(forecast.capLastsUntil)}
          </strong>
          .{" "}
        </>
      ) : (
        <>
          The <strong className="font-semibold text-fg">{cap} cap</strong> has no projected end date
          at the current daily rate.{" "}
        </>
      )}
      Forecast for scheduled checks:{" "}
      <strong className="font-semibold text-fg">{next48h}/next 48h.</strong>
    </p>
  );
}
