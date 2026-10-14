import type { Coordinate } from "./types";

const SCALE = 10_000_000n;
const LATITUDE_LIMIT = 90n * SCALE;
const LONGITUDE_LIMIT = 180n * SCALE;

function scaledDecimal(text: string) {
  if (text.length > 32 || !/^-?\d+(?:\.\d{1,7})?$/u.test(text)) {
    throw new Error("Coordinate must be a decimal string with at most seven places");
  }
  const negative = text.startsWith("-");
  const [integer, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const value = BigInt(integer) * SCALE + BigInt(fraction.padEnd(7, "0"));
  return negative ? -value : value;
}

function decimal(value: bigint) {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / SCALE}.${(absolute % SCALE).toString().padStart(7, "0")}`;
}

export function canonicalCoordinate(latitude: string, longitude: string): Coordinate {
  const lat = scaledDecimal(latitude);
  let lon = scaledDecimal(longitude);
  if (
    lat < -LATITUDE_LIMIT ||
    lat > LATITUDE_LIMIT ||
    lon < -LONGITUDE_LIMIT ||
    lon > LONGITUDE_LIMIT
  ) {
    throw new Error("Coordinate outside latitude/longitude range");
  }
  if (lon === LONGITUDE_LIMIT) lon = -LONGITUDE_LIMIT;
  if (lat === LATITUDE_LIMIT || lat === -LATITUDE_LIMIT) lon = 0n;
  return Object.freeze({ latitude: decimal(lat), longitude: decimal(lon) });
}

/** Only bounded scaled integers cross into floating point for the explicit spherical model. */
export function coordinateDegrees(coordinate: Coordinate) {
  const canonical = canonicalCoordinate(coordinate.latitude, coordinate.longitude);
  return {
    latitude: Number(scaledDecimal(canonical.latitude)) / Number(SCALE),
    longitude: Number(scaledDecimal(canonical.longitude)) / Number(SCALE),
  };
}

export function computedCoordinate(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90) {
    throw new Error("Invalid geodesic destination");
  }
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return canonicalCoordinate(latitude.toFixed(7), wrapped.toFixed(7));
}
