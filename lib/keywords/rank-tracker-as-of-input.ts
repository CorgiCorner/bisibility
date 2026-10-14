import { z } from "zod";

export const rankTrackerAsOfFormSchema = z.object({
  date: z.string().refine((value) => {
    if (!value) return true;
    const canonical = value + ":00.000Z",
      time = Date.parse(canonical);
    return (
      /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) &&
      Number.isFinite(time) &&
      new Date(time).toISOString() === canonical &&
      time <= Date.now() &&
      time >= 0
    );
  }),
});
