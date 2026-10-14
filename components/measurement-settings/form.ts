export {
  measurementDraftFormSchema,
  measurementSelectionSchema,
  scheduleDraftSchema,
} from "@/lib/measurement-settings/schema";

import { z } from "zod";
export const explicitReviewSchema = z
  .object({ confirmed: z.boolean().refine((value) => value, "confirm_required") })
  .strict();
