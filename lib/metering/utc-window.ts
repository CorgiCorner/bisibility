export function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
export function nextMonthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
export function monthUtcRange(now = new Date()) {
  return { gte: monthStartUtc(now), lt: nextMonthStartUtc(now) };
}
