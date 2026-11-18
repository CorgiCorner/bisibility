import type { ResourceCapacityProjection } from "@/lib/capacity/resource-change";
import type { ScheduleSpendDecision } from "./review-decision";

export type ScheduleCapacityPreview = {
  exceeded: boolean;
  dimensions: ResourceCapacityProjection;
} | null;

export type ScheduleChangePreview = ScheduleSpendDecision & {
  capacity: ScheduleCapacityPreview;
  expected_revision: string;
  preview_token: string | null;
  window_start: string;
};
