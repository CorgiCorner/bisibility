import { modelProviderName } from "./composer-state";
import { modelProviderIdSchema } from "./schema";

export function nativeHistoryKey(provider: string, model: string) {
  return `api:${provider}:${model}`;
}
export function nativeHistoryModel(value: string) {
  const match = /^api:([^:]+):(.+)$/.exec(value);
  const provider = modelProviderIdSchema.safeParse(match?.[1]);
  return match && provider.success
    ? { model: match[2], provider: modelProviderName(provider.data) }
    : null;
}

export function nativeHistoryLabel(value: string, provenanceLabel: string) {
  const model = nativeHistoryModel(value);
  return model ? `${model.provider} / ${model.model} · ${provenanceLabel}` : value;
}
