const endpoint = "http://127.0.0.1:9222";

export async function assertOperaEndpoint(fetcher = fetch) {
  let version;
  try {
    const response = await fetcher(`${endpoint}/json/version`, {
      signal: AbortSignal.timeout(3_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Unreachable CDP endpoint");
    version = await response.json();
    const socket = new URL(version.webSocketDebuggerUrl);
    if (
      socket.protocol !== "ws:" ||
      socket.hostname !== "127.0.0.1" ||
      socket.port !== "9222" ||
      !socket.pathname.startsWith("/devtools/browser/") ||
      !/(?:\bOpera(?: Air)?[ /]|\bOPR\/)/i.test(
        `${version.Browser ?? ""} ${version["User-Agent"] ?? ""}`,
      )
    )
      throw new Error("Unverified browser");
    return socket.href;
  } catch {
    throw new Error(
      "Local browser tests require the existing Opera Air CDP endpoint on 127.0.0.1:9222.",
    );
  }
}
