"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { formatDate } from "@/lib/dates/format";

export function TrackedWebsiteNotice({
  domain,
  since,
}: Readonly<{ domain: string; since: string }>) {
  const dateFormat = useDateFormat();
  return (
    <div className="mt-5.5 max-w-[440px]" role="status">
      <p className="m-0 text-sm font-medium">
        Tracking {domain} since {formatDate(since.slice(0, 10), dateFormat)}
      </p>
      <p className="m-0 mt-2 text-[13px] text-fg-muted">
        This website has rank checks. To track a different website, create a new project.
      </p>
    </div>
  );
}
