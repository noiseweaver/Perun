// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

/*
 * The few web platform APIs the theme link codec uses, typed structurally so this package keeps
 * its ES2022-only lib. Browsers and Node 18+ provide all of them as globals.
 */

interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}

interface ByteStream {
  getReader(): ByteReader;
  pipeThrough(transform: unknown): ByteStream;
}

interface Platform {
  CompressionStream: new (format: 'deflate-raw') => unknown;
  DecompressionStream: new (format: 'deflate-raw') => unknown;
  Blob: new (parts: Uint8Array[]) => { stream(): ByteStream };
  TextEncoder: new () => { encode(s: string): Uint8Array };
  TextDecoder: new (
    label: string,
    options: { fatal: boolean },
  ) => {
    decode(b: Uint8Array): string;
  };
}

const platform = globalThis as unknown as Platform;

export function utf8Encode(s: string): Uint8Array {
  return new platform.TextEncoder().encode(s);
}

/** Strict UTF-8 decoding; throws on malformed input. */
export function utf8Decode(b: Uint8Array): string {
  return new platform.TextDecoder('utf-8', { fatal: true }).decode(b);
}

/** Read a stream to its end, or throw once it passes `limit` bytes. */
async function readAll(stream: ByteStream, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.length;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`larger than ${limit} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Raw DEFLATE (RFC 1951). */
export function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const s = new platform.Blob([data])
    .stream()
    .pipeThrough(new platform.CompressionStream('deflate-raw'));
  return readAll(s, Number.MAX_SAFE_INTEGER);
}

/** Inflate raw DEFLATE data, giving up past `limit` output bytes (so a tiny bomb can't fill RAM). */
export function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const s = new platform.Blob([data])
    .stream()
    .pipeThrough(new platform.DecompressionStream('deflate-raw'));
  return readAll(s, limit);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding (RFC 4648 section 5). */
export function base64UrlEncode(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = ((b[i] ?? 0) << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    const chars = Math.min(b.length - i, 3) + 1;
    for (let k = 0; k < chars; k++) out += B64[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

/** Decode base64url (padding optional); null if it holds anything else. */
export function base64UrlDecode(s: string): Uint8Array | null {
  const t = s.replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]*$/.test(t) || t.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((t.length * 3) / 4));
  let at = 0;
  for (let i = 0; i < t.length; i += 4) {
    let n = 0;
    const len = Math.min(4, t.length - i);
    for (let k = 0; k < 4; k++) n = (n << 6) | (k < len ? B64.indexOf(t[i + k] as string) : 0);
    for (let k = 0; k < len - 1; k++) out[at++] = (n >> (16 - 8 * k)) & 255;
  }
  return out;
}
