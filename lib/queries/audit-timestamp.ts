export function formatAuditTimestamp(date: Date) {
  const pad = (part: number) => part.toString().padStart(2, "0");
  const utcDate = [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())].join(
    "-",
  );
  const utcTime = [
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join(":");
  return `${utcDate} ${utcTime} UTC`;
}
