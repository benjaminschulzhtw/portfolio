import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { FIXTURE_DIR } from './fixture';

/** Erzeugt Test-Paarungen mit fiktiven Namen. Bei zwei Personen ist die Zuordnung eindeutig. */
export default function globalSetup(): void {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(
    `${FIXTURE_DIR}/participants.json`,
    JSON.stringify(['Testi Tanne', 'Maximiliane-Friederike von Schneeflockenhausen-Lebkuchenstein']),
  );
  execFileSync(process.execPath, [
    'scripts/generate-pairs.mjs',
    `${FIXTURE_DIR}/participants.json`,
    '--base',
    'http://localhost/',
    '--out',
    `${FIXTURE_DIR}/pairs.json`,
    '--links',
    `${FIXTURE_DIR}/links.json`,
  ]);
}
