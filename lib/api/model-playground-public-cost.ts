import {
  modelCostEvidenceSchema,
  modelMoneySchema,
} from "@/lib/providers/model/transport-contract";
import { z } from "zod";

export const reportedMoney = modelMoneySchema.safeExtend({
  amount: modelMoneySchema.shape.amount.unwrap(),
  rateCardVersion: z.null(),
  certainty: z.literal("reported"),
  basis: z.enum(["provider_response", "original_request_readback"]),
});
export const estimatedMoney = modelMoneySchema.safeExtend({
  amount: modelMoneySchema.shape.amount.unwrap(),
  rateCardVersion: modelMoneySchema.shape.rateCardVersion.unwrap(),
  certainty: z.literal("estimated"),
  basis: z.literal("rate_card"),
});
export const unknownMoney = modelMoneySchema.safeExtend({
  amount: z.null(),
  certainty: z.literal("unknown"),
  basis: z.literal("unknown"),
  rateCardVersion: z.null(),
});
export const publicProviderCostSchema = z.discriminatedUnion("certainty", [
  reportedMoney,
  unknownMoney,
]);
export const publicCostEvidenceSchema = modelCostEvidenceSchema.safeExtend({
  providerReported: modelCostEvidenceSchema.shape.providerReported
    .unwrap()
    .safeExtend({ money: reportedMoney })
    .nullable(),
  upstreamInference: modelCostEvidenceSchema.shape.upstreamInference
    .unwrap()
    .safeExtend({
      total: reportedMoney.nullable(),
      input: reportedMoney.nullable(),
      output: reportedMoney.nullable(),
    })
    .nullable(),
  localEstimate: estimatedMoney.nullable(),
});
