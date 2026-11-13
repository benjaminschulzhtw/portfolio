/** Gegenstück zu scripts/generate-pairs.mjs. Läuft im Web Worker und als Fallback im Hauptthread. */

export interface EncryptedEntry {
  s: string;
  iv: string;
  c: string;
}

export interface PairsFile {
  v: number;
  iterations: number;
  entries: Record<string, EncryptedEntry>;
}

export interface Pairing {
  g: string;
  r: string;
}

export interface DecryptRequest {
  code: string;
  entry: EncryptedEntry;
  iterations: number;
}

const fromB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

/** Normalisiert den Code aus dem URL-Fragment (Groß-/Kleinschreibung, Leerzeichen, Bindestriche). */
export function normalizeCode(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* kaputtes Encoding: roh weiterverwenden */
  }
  return decoded.replace(/^#/, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function lookupId(code: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`wichteln:${code}`));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export async function decryptEntry({ code, entry, iterations }: DecryptRequest): Promise<Pairing> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(entry.s), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(entry.iv) }, key, fromB64(entry.c));
  return JSON.parse(new TextDecoder().decode(plain)) as Pairing;
}
