import type { LocalMeasurementRunItem } from "@/lib/generated/prisma/client";
import type {
  CollectedLocalResult,
  SubmissionRecord,
} from "@/lib/local-monitoring/execution-types";
import type { ExecutionTargetV1, PointRevision } from "@/lib/local-monitoring/types";
import type { ObservationRunInput } from "@/lib/observation/types";
import type { LocalTransaction } from "./context";

/** Implemented provider normalization supplies proof; persistence never parses raw responses. */
export interface LocalNormalizationPort {
  /** Trusted adapter hook inside the original custody transaction; replay verifies retained decisions. */
  afterPersist?(input: {
    tx: LocalTransaction;
    item: LocalMeasurementRunItem;
    record: SubmissionRecord;
    observationId: string;
    target: ExecutionTargetV1;
    point: PointRevision;
    replay: boolean;
    now: Date;
  }): Promise<void>;
  normalize(input: {
    record: SubmissionRecord;
    result: CollectedLocalResult;
    target: ExecutionTargetV1;
    point: PointRevision;
  }): Promise<ObservationRunInput>;
}
