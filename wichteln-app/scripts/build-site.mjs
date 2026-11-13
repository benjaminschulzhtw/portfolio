#!/usr/bin/env node
/**
 * Baut die Wichtel-App und legt das Ergebnis in ../wichteln ab.
 * Genau diesen Ordner liefert GitHub Pages unter schulz-benjamin.de/wichteln/ aus,
 * und die Startseite lädt von dort main.js und styles.css, sobald ein #CODE im Link steht.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = join(app, 'dist', 'wichteln', 'browser');
const target = resolve(app, '..', 'wichteln');

execFileSync('npx', ['ng', 'build', '--configuration', 'production,site'], {
  cwd: app,
  stdio: 'inherit',
});

if (!existsSync(join(built, 'main.js'))) {
  throw new Error(`Build unvollständig: ${join(built, 'main.js')} fehlt.`);
}

rmSync(target, { recursive: true, force: true });
cpSync(built, target, { recursive: true });

console.log(`\n${readdirSync(target).length} Einträge nach ${target} kopiert.`);
console.log('Zum Veröffentlichen: wichteln/ committen und pushen.');
