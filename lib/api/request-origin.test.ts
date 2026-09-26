import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuth } from "./auth";
import {
  apiRequestOrigin,
  parseSourceHeader,
  providerOrigin,
  SOURCE_HEADER,
} from "./request-origin";

vi.mock("server-only", () => ({}));

const projectKeyAuth: ApiAuth = {
  apiKey: {
    id: "key_test",
    name: "Automation",
    prefix: "bsb_key_live_",
    projectId: "project_1",
    scopes: ["read"],
  },
  kind: "project_key",
  project: {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    domain: "example.com",
    id: "project_1",
    name: "Example",
    publicId: "prj_a00000000000000000000000",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
};

function personalTokenAuth(oauthClientId?: string): ApiAuth {
  return {
    kind: "personal_token",
    memberships: [],
    oauthClientId,
    token: {
      id: "pat_1",
      name: "Automation",
      prefix: "bsb_pat_live_",
      publicId: null,
      scopes: ["read"],
      userId: "user_1",
    },
    user: {
      email: "owner@example.com",
      id: "user_1",
      name: "Owner",
      publicId: null,
    },
  };
}

function headers(source: string | null) {
  const value = new Headers();
  if (source !== null) value.set(SOURCE_HEADER, source);
  return value;
}

describe("parseSourceHeader", () => {
  it.each([
    [null, "api"],
    ["", "api"],
    ["SDK ", "sdk"],
    ["sdk", "sdk"],
    ["cli", "cli"],
    ["mcp", "mcp"],
    ["app", "api"],
    ["worker", "api"],
    ["api", "api"],
    ["bogus", "api"],
  ] as const)("maps %p to %p", (input, expected) => {
    expect(parseSourceHeader(input)).toBe(expected);
  });
});

describe("apiRequestOrigin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attributes a project key to the api key id", () => {
    expect(apiRequestOrigin(projectKeyAuth, headers("sdk"))).toEqual({
      credentialId: "key_test",
      credentialKind: "project_key",
      source: "sdk",
      surface: "programmatic",
    });
  });

  it("attributes a personal token to the token id", () => {
    expect(apiRequestOrigin(personalTokenAuth(), headers(null))).toEqual({
      credentialId: "pat_1",
      credentialKind: "personal_token",
      source: "api",
      surface: "programmatic",
    });
  });

  it("attributes an OAuth personal token to the OAuth client id", () => {
    expect(apiRequestOrigin(personalTokenAuth("mcp-client-1"), headers("mcp"))).toEqual({
      credentialId: "mcp-client-1",
      credentialKind: "oauth_client",
      source: "mcp",
      surface: "programmatic",
    });
  });
});

describe("providerOrigin", () => {
  it("maps a project-key request origin to the provider request origin", () => {
    expect(providerOrigin(apiRequestOrigin(projectKeyAuth, headers("sdk")))).toEqual({
      credential: { id: "key_test", kind: "project_key" },
      source: "sdk",
    });
  });
});
