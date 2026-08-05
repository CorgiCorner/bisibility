import { createConnection } from "node:net";

type TemporalTransportTarget = {
  host: string;
  port: number;
};

export function parseTemporalAddress(address: string): TemporalTransportTarget {
  const value = address.trim();
  if (value.includes("://")) {
    throw new Error("TEMPORAL_ADDRESS must use host:port syntax without a URL scheme.");
  }

  const bracketed = /^\[([^\]]+)]:(\d+)$/.exec(value);
  const separator = value.lastIndexOf(":");
  const host = bracketed?.[1] ?? (separator > 0 ? value.slice(0, separator) : "");
  const portText = bracketed?.[2] ?? (separator > 0 ? value.slice(separator + 1) : "");
  if (!host || (!bracketed && host.includes(":"))) {
    throw new Error("TEMPORAL_ADDRESS must use host:port syntax; bracket IPv6 addresses.");
  }

  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("TEMPORAL_ADDRESS must contain a valid TCP port.");
  }
  return { host, port };
}

export async function probeTemporalTransport(
  address: string,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const target = parseTemporalAddress(address);
  const timeoutMs = options.timeoutMs ?? 5_000;

  await new Promise<void>((resolve, reject) => {
    const socket = createConnection(target);
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.once("connect", () => finish());
    socket.once("error", (error) => finish(error));
    socket.setTimeout(timeoutMs, () => {
      const error = Object.assign(
        new Error(`Temporal transport probe timed out after ${timeoutMs}ms.`),
        { code: "ETIMEDOUT" },
      );
      finish(error);
    });
  });
}
