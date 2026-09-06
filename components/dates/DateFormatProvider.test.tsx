import { DateFormatProvider, useDateFormat } from "@/components/dates/DateFormatProvider";
import { type DateFormat, formatDate } from "@/lib/dates/format";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

function Sample() {
  const format = useDateFormat();
  return <time>{formatDate("2026-08-24", format)}</time>;
}

describe("DateFormatProvider hydration", () => {
  it.each(["day_first", "month_first", "iso"] as const)(
    "renders the same %s string on the server and through the provider",
    (format: DateFormat) => {
      const expected = formatDate("2026-08-24", format);
      const markup = renderToStaticMarkup(
        <DateFormatProvider value={format}>
          <Sample />
        </DateFormatProvider>,
      );
      expect(markup).toBe(`<time>${expected}</time>`);
    },
  );
});
