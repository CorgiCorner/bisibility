export function dataSourceStatusColor(status: string) {
  if (/failed|error/i.test(status)) {
    return "var(--red)";
  }

  if (/not connected|disconnected/i.test(status)) {
    return "var(--fg-muted)";
  }

  if (/missing|migration hold|paused/i.test(status)) {
    return "var(--yellow)";
  }

  return "var(--green)";
}

export function dataSourceStatusTextColor(status: string) {
  if (/failed|error/i.test(status)) return "var(--red-text)";
  if (/not connected|disconnected/i.test(status)) return "var(--fg-muted)";
  if (/missing|migration hold|paused/i.test(status)) return "var(--yellow-text)";
  return "var(--green-text)";
}
