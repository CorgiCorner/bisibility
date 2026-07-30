import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export function sha256Bytes(input: string) {
  return sha256(utf8ToBytes(input));
}

export function sha256Hex(input: string) {
  return bytesToHex(sha256Bytes(input));
}
