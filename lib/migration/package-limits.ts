export const IMPORT_PACKAGE_MAX_KEYWORDS = 500;
export const IMPORT_PACKAGE_MAX_BODY_BYTES = 8_388_608;

export function byteLimitLabel(bytes: number) {
  const mebibyte = 1024 * 1024;
  if (bytes % mebibyte === 0) return `${bytes / mebibyte} MiB`;
  if (bytes % 1024 === 0) return `${bytes / 1024} KiB`;
  return `${bytes} bytes`;
}

export function keywordLimitDetail(actual: number) {
  return `Package contains ${actual} keywords; this upload path supports up to ${IMPORT_PACKAGE_MAX_KEYWORDS}. Reduce the package or use the chunked push flow.`;
}

export function payloadLimitDetail(limit: number) {
  return `Package exceeds the ${byteLimitLabel(limit)} upload maximum. Reduce the package or use the chunked push flow.`;
}
