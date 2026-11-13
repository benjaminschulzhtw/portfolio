#!/usr/bin/env node
/**
 * Erzeugt die verschlüsselten Wichtel-Paarungen und die persönlichen Links.
 *
 *   node scripts/generate-pairs.mjs <teilnehmer.json> --base https://example.org/
 *        [--out public/data/pairs.json] [--links scripts/links.local.txt] [--iterations 600000]
 *
 * teilnehmer.json: ["Name A", "Name B", ...]
 *
 * Für jede Person wird ein zufälliger Code erzeugt. Aus dem Code leitet PBKDF2-SHA-256
 * einen AES-GCM-Schlüssel ab, mit dem {g: Schenkende/r, r: Beschenkte/r} verschlüsselt wird.
 * Gespeichert wird nur: SHA-256(Code) als Nachschlage-ID, Salt, IV und Chiffrat.
 * Der Code selbst steht ausschließlich im Link-Fragment (#code) und erreicht nie einen Server.
 */
import { webcrypto as crypto } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O, 1/I
const CODE_LENGTH = 12; // 32^12 ≈ 2^60

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

function randomInt(max) {
  // gleichverteilte Zufallszahl in [0, max)
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Sattolo-Algorithmus: zufälliger Zyklus über alle Personen, niemand zieht sich selbst. */
function derangement(n) {
  const p = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(i);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

async function lookupId(code) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`wichteln:${code}`));
  return Buffer.from(hash).toString('hex').slice(0, 32);
}

async function encrypt(code, payload, iterations) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return { s: b64(salt), iv: b64(iv), c: b64(new Uint8Array(ct)) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [input] = args._;
  if (!input || !args.base) {
    console.error('Aufruf: node scripts/generate-pairs.mjs <teilnehmer.json> --base <URL der Seite>');
    process.exit(1);
  }
  const out = resolve(args.out ?? 'public/data/pairs.json');
  const linksFile = resolve(args.links ?? 'scripts/links.local.txt');
  const iterations = Number(args.iterations ?? 600_000);

  const names = JSON.parse(readFileSync(input, 'utf8')).map((n) => String(n).trim());
  if (names.length < 2) throw new Error('Mindestens zwei Teilnehmende nötig.');
  if (new Set(names).size !== names.length) throw new Error('Namen müssen eindeutig sein.');

  const perm = derangement(names.length);
  const entries = [];
  const links = [];
  for (let i = 0; i < names.length; i++) {
    const code = randomCode();
    const id = await lookupId(code);
    entries.push([id, await encrypt(code, { g: names[i], r: names[perm[i]] }, iterations)]);
    const url = new URL(args.base);
    url.hash = code;
    links.push({ name: names[i], code, url: url.toString() });
  }
  // nach ID sortieren, damit die Reihenfolge nichts über die Teilnehmerliste verrät
  entries.sort(([a], [b]) => a.localeCompare(b));

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ v: 1, iterations, entries: Object.fromEntries(entries) }));

  mkdirSync(dirname(linksFile), { recursive: true });
  writeFileSync(
    linksFile,
    linksFile.endsWith('.json')
      ? JSON.stringify(links, null, 2)
      : links.map((l) => `${l.name}: ${l.url}`).join('\n') + '\n',
  );
  console.log(`${names.length} Paarungen → ${out}`);
  console.log(`Persönliche Links → ${linksFile} (nicht committen, einzeln verschicken)`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
