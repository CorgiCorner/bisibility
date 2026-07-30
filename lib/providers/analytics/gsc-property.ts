export function normalizeGscProperty(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith("sc-domain:")) {
    return `sc-domain:${value.slice("sc-domain:".length).trim().replace(/\/$/, "").toLowerCase()}`;
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!url.pathname.endsWith("/")) {
        url.pathname = `${url.pathname}/`;
      }
      return url.toString();
    } catch {
      return value;
    }
  }
  if (!value.includes("/") && value.includes(".")) {
    return `sc-domain:${value.toLowerCase()}`;
  }
  return value;
}
