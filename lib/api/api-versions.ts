import { errorResponse } from "./responses";

export const API_VERSION_HEADER = "Bisibility-API-Version";

const servedApiVersions = ["v1"] as const;

export function getApiVersionCapabilities() {
  return { apiVersions: [...servedApiVersions] };
}

export function getDeclaredApiVersion(headers: Headers) {
  return headers.get(API_VERSION_HEADER)?.trim() || null;
}

export function isServedApiVersion(version: string) {
  return servedApiVersions.some((servedVersion) => servedVersion === version);
}

export function unsupportedApiVersionResponse(req: Request) {
  const declaredApiVersion = getDeclaredApiVersion(req.headers);
  if (!declaredApiVersion || isServedApiVersion(declaredApiVersion)) {
    return null;
  }

  const url = new URL(req.url);
  return errorResponse(
    "unsupported_api_version",
    `The declared API version ${declaredApiVersion} is not served by this server.`,
    409,
    {
      details: {
        ...getApiVersionCapabilities(),
        declaredApiVersion,
      },
      instance: `urn:bisibility:api:v1:${url.pathname}`,
    },
  );
}

export const apiVersionHeaderParameter = {
  description:
    "API contract version requested by the client. Omit this header to use the current backward-compatible behavior.",
  in: "header",
  name: API_VERSION_HEADER,
  required: false,
  schema: {
    enum: [...servedApiVersions],
    type: "string",
  },
} as const;
