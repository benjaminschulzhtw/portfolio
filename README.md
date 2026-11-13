Hi, I'm Benjamin.

Die Seite liegt als statisches GitHub Pages unter [schulz-benjamin.de](https://schulz-benjamin.de).

## Aufbau

| Pfad            | Inhalt                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| `index.html`    | Platzhalterseite mit Loader, dazu die Weiche für Wichtel-Links          |
| `style.css`     | Styles der Platzhalterseite                                             |
| `wichteln/`     | **fertiger Build** der Wichtel-App (wird ausgeliefert, nicht bearbeiten) |
| `wichteln-app/` | Quellcode der Wichtel-App (Angular), siehe dortige README               |

## Wichteln

`schulz-benjamin.de` zeigt wie bisher die Platzhalterseite. Steht im Link ein persönlicher
Code, also `schulz-benjamin.de/#ABC123...`, lädt dieselbe Seite die Wichtel-App aus
`wichteln/` nach. Die Adresse bleibt dabei unverändert, es gibt keine Weiterleitung.

Der Code steht nur im Fragment hinter dem `#` und wird vom Browser nie an den Server
geschickt. Welchen Namen jemand zieht, entscheidet sich erst im Browser der Person.

Neue Runde aufsetzen: siehe [wichteln-app/README.md](wichteln-app/README.md).
