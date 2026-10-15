import type { ReportJson } from "./model";

export type SavedAuditPage = {
  id: string;
  url: string;
  title: string | null;
  status: number | null;
};

/** Old reports can expose saved pages without enough evidence for crawl KPIs. */
export function savedAuditPages(body: Record<string, ReportJson>): SavedAuditPage[] {
  if (!Array.isArray(body.pages)) return [];
  return body.pages.flatMap((page, index) => {
    if (!page || typeof page !== "object" || Array.isArray(page) || typeof page.url !== "string")
      return [];
    return [
      {
        id: String(index),
        url: page.url,
        title: typeof page.title === "string" ? page.title : null,
        status:
          typeof page.status === "number" &&
          Number.isInteger(page.status) &&
          page.status >= 100 &&
          page.status <= 599
            ? page.status
            : null,
      },
    ];
  });
}
