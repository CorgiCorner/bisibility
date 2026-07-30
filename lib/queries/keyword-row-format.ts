export function deviceLabel(device: string) {
  return device === "mobile" ? "Mobile" : "Desktop";
}

export function pathFromUrl(value: string) {
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}
