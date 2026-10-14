import { requireToken } from "./key";

function dimension(values: readonly string[], label: string) {
  values.forEach((value) => {
    requireToken(value, label);
  });
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
  return BigInt(values.length);
}

/** Logical independent probes only; pages, fallback, retry and native prices need separate quotes. */
export function logicalProbeCount(input: {
  keywordRevisions: readonly string[];
  pointRevisions: readonly string[];
  surfaces: readonly string[];
  devices: readonly string[];
  requiredExecutions: number;
}) {
  if (!Number.isSafeInteger(input.requiredExecutions) || input.requiredExecutions < 0)
    throw new Error("Invalid required execution count");
  return (
    dimension(input.keywordRevisions, "keyword revision") *
    dimension(input.pointRevisions, "point revision") *
    dimension(input.surfaces, "surface") *
    dimension(input.devices, "device") *
    BigInt(input.requiredExecutions)
  );
}
