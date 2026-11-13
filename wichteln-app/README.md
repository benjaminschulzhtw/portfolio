# Wichteln

Mobile-first-Seite zum Aufdecken des Wichtel-Loses: Ein großes Geschenk muss dreimal per
Schneeball gerüttelt werden, dann springt ein Goblin heraus und hält den Namen hoch.
Angular 22, spartan-ng (nur Button für die Fehlerseite), Tailwind 4.

Die App wird als Teil von [schulz-benjamin.de](https://schulz-benjamin.de) ausgeliefert:
Der fertige Build liegt im Ordner `../wichteln`, und die Startseite lädt ihn, sobald im
Link ein persönlicher Code steht.

## Einmalig

```bash
npm ci
```

## Neue Wichtel-Runde

1. Namen als JSON-Liste ablegen (Vorlage: `scripts/participants.example.json`).
2. Lose und Links erzeugen:

   ```bash
   npm run generate -- teilnehmer.json --base https://schulz-benjamin.de/
   ```

   - `public/data/pairs.json`: nur verschlüsselte Lose, darf veröffentlicht werden.
   - `scripts/links.local.txt`: die persönlichen Links, **nicht committen** (ist in
     `.gitignore`), einzeln per WhatsApp verschicken.

3. Website-Build erzeugen und veröffentlichen:

   ```bash
   npm run build:site
   cd ..
   git add wichteln wichteln-app/public/data/pairs.json
   git commit -m "Wichtel-Lose 2026"
   git push
   ```

Jeder Link enthält einen zufälligen Code im Fragment (`#ABC…`). Das Fragment wird nie an
den Server gesendet. Aus dem Code leitet PBKDF2-SHA-256 (600 000 Iterationen) einen
AES-GCM-Schlüssel ab. Entschlüsselt wird im Web Worker, damit die Seite nicht einfriert.

## Entwickeln

```bash
npm start          # nur die App: http://localhost:4200/#<CODE>
npm run build:site # Build nach ../wichteln
npm test           # Unit-Tests (Vitest)
npm run e2e        # Playwright gegen die fertige Website (baut vorher)
```

`npm run e2e` testet iPhone SE, iPhone 15 und Pixel 7, jeweils hoch und quer, inklusive
WhatsApp-WebView und der Weiche auf der Startseite. Screenshot-Vorlagen liegen in
`e2e/mobile.spec.ts-snapshots/`; nach gewollten Layoutänderungen:
`npx playwright test --update-snapshots`.

## Hinweise zum Betrieb

- HTTPS ist Pflicht, sonst blockiert der Browser die Web Crypto API.
- `../wichteln` wird von `npm run build:site` komplett neu geschrieben. Dort nichts von
  Hand ändern.
- Die Weiche in `../index.html` erkennt einen Code an mindestens acht Zeichen aus dem
  Zeichenvorrat `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Ohne Treffer bleibt die
  Platzhalterseite stehen.
