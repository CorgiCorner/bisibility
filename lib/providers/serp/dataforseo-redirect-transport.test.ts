import { afterEach, expect, it, vi } from "vitest";
import { dataForSeoRedirectTransport } from "./dataforseo-redirect-transport";

const credentials = { login: "fixture", password: "fixture" };
const url = "https://google.com/goto?url=synthetic";

afterEach(() => vi.unstubAllGlobals());

it.each([
  [503, { status_code: 20000, tasks: [{ status_code: 20000, result: [] }] }],
  [200, { status_code: 50000, tasks: [{ status_code: 20000, result: [] }] }],
  [200, { status_code: 20000, tasks: [] }],
  [
    200,
    {
      status_code: 20000,
      tasks: [
        { status_code: 20000, result: [] },
        { status_code: 20000, result: [] },
      ],
    },
  ],
  [200, { status_code: 20000, tasks: [{ status_code: 50000, result: [] }] }],
  [200, { status_code: 20000, tasks: [{ status_code: 20000, result: null }] }],
])("rejects HTTP or envelope errors", async (status, body) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
  await expect(dataForSeoRedirectTransport(credentials, 1000)([url])).rejects.toThrow();
});

it("sends the exact input and accepts the documented response", async () => {
  const fetchMock = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(
        JSON.stringify({
          status_code: 20000,
          tasks: [{ status_code: 20000, result: [{ goto: url, url: "http://example.com/page" }] }],
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  await expect(dataForSeoRedirectTransport(credentials, 1000)([url])).resolves.toEqual([
    { goto: url, url: "http://example.com/page" },
  ]);
  expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual([{ goto_urls: [url] }]);
});
