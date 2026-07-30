export type PropertyNormalizationResult<ErrorCode extends string> =
  | { ok: true; value: string }
  | { error: { code: ErrorCode; message: string }; ok: false };

export type Ga4PropertyErrorCode = "measurement-id" | "universal-analytics" | "invalid";
export type GscPropertyErrorCode = "invalid";

const GA4_PROPERTY_LOCATION =
  "GA4: Admin (gear, bottom-left) -> Property settings -> Property details -> Property ID";

function ga4PropertyError(
  code: Ga4PropertyErrorCode,
  input: string,
): PropertyNormalizationResult<Ga4PropertyErrorCode> {
  const pasted = JSON.stringify(input);
  const requirement =
    "Enter the digits-only GA4 Property ID (for example, 123456789). " +
    `Find it in ${GA4_PROPERTY_LOCATION}.`;

  if (code === "measurement-id") {
    return {
      error: {
        code,
        message: `${pasted} is a Measurement ID for a web data stream, not a GA4 Property ID. ${requirement}`,
      },
      ok: false,
    };
  }
  if (code === "universal-analytics") {
    return {
      error: {
        code,
        message: `${pasted} is a Universal Analytics tracking ID, not a GA4 Property ID. ${requirement}`,
      },
      ok: false,
    };
  }
  return {
    error: {
      code,
      message: `${pasted} is not a valid GA4 Property ID. ${requirement}`,
    },
    ok: false,
  };
}

export function normalizeGa4PropertyId(
  input: string,
): PropertyNormalizationResult<Ga4PropertyErrorCode> {
  const value = input.trim();
  if (/^G-/i.test(value)) return ga4PropertyError("measurement-id", value);
  if (/^UA-/i.test(value)) return ga4PropertyError("universal-analytics", value);
  if (/^\d+$/.test(value)) return { ok: true, value };

  const resourceName = /^properties\/(\d+)$/i.exec(value);
  if (resourceName) return { ok: true, value: resourceName[1] };
  return ga4PropertyError("invalid", value);
}

function isValidDomainProperty(value: string) {
  if (!value.startsWith("sc-domain:")) return false;
  const domain = value.slice("sc-domain:".length);
  if (domain.length > 253 || !domain.includes(".")) return false;
  return domain
    .split(".")
    .every(
      (label) =>
        label.length > 0 && label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label),
    );
}

function isValidUrlProperty(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeGscProperty(
  input: string,
): PropertyNormalizationResult<GscPropertyErrorCode> {
  const value = input.trim();
  if (isValidDomainProperty(value) || isValidUrlProperty(value)) {
    return { ok: true, value };
  }
  return {
    error: {
      code: "invalid",
      message:
        `${JSON.stringify(value)} is not a valid Search Console property. ` +
        "Select sc-domain:example.com or a full http:// or https:// URL from Google Search Console.",
    },
    ok: false,
  };
}

export function normalizeStoredGscProperty(
  input: string,
): PropertyNormalizationResult<GscPropertyErrorCode> {
  const value = input.trim();
  let candidate = value;

  if (/^sc-domain:/i.test(value)) {
    candidate = `sc-domain:${value.slice("sc-domain:".length).replace(/\/$/, "").toLowerCase()}`;
  } else if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
      candidate = url.toString();
    } catch {
      return normalizeGscProperty(value);
    }
  } else if (!value.includes("/") && value.includes(".")) {
    candidate = `sc-domain:${value.toLowerCase()}`;
  }

  return normalizeGscProperty(candidate);
}
