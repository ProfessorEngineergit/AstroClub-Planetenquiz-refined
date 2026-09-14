# AstroClub Planetenquiz

Zweisprachiges (DE/EN) Planeten-Quiz mit Multiple-Choice-Fragen, 50:50-Joker und einer
Drag-and-drop-Zuordnung der Planeten. Maximalpunktzahl: 160.

Das Quiz läuft in zwei Varianten:

| | Online | Offline |
|---|---|---|
| Verteilung | Firebase Hosting | eine einzelne HTML-Datei |
| Leaderboard | [Firestore-Scoreboard](https://github.com/ProfessorEngineergit/AstroClub-Planetenquiz--Scoreboard), live über mehrere Geräte | lokal im Browser, pro Rechner |
| Voraussetzung | Internetverbindung | keine |

---

## Offline-Version herunterladen

<p align="center">
  <a href="https://github.com/ProfessorEngineergit/AstroClub-Planetenquiz-refined/releases/latest/download/Planetenquiz-Offline.html">
    <img alt="Offline-Version herunterladen" src="https://img.shields.io/badge/Offline--Version_herunterladen-eine_HTML--Datei_·_~540_KB-5eead4?style=for-the-badge&labelColor=090b10&logo=html5&logoColor=5eead4">
  </a>
</p>

<p align="center">
  <sub>Kein Release vorhanden? Dann direkt aus dem Repo:
  <a href="https://github.com/ProfessorEngineergit/AstroClub-Planetenquiz-refined/blob/main/dist/Planetenquiz-Offline.html">dist/Planetenquiz-Offline.html</a>
  → Button <b>Download raw file</b>.</sub>
</p>

### Auf dem Windows-Rechner

1. Datei auf den Desktop, auf einen USB-Stick oder ins Netzlaufwerk legen.
2. Doppelklick. Sie öffnet sich im Standardbrowser (Edge, Chrome, Firefox).

Keine Installation, keine Administratorrechte, kein Internet. Die Datei ist in sich
abgeschlossen — sie darf umbenannt und beliebig kopiert werden.

### Was offline anders ist

* **Das Leaderboard ist lokal.** Scores landen im `localStorage` des Browsers und
  gelten nur für diesen Rechner und dieses Browserprofil. Nach dem Auswerten öffnet
  der Button *Leaderboard öffnen* die Bestenliste, dort lassen sich alle Einträge als
  CSV exportieren oder löschen.
* **Kein Firebase.** Firebase Auth lässt unter `file://` keine Anmeldung zu, deshalb
  wäre das Firestore-Scoreboard dort ohnehin nicht erreichbar. Der Offline-Build
  ersetzt es vollständig durch den lokalen Score-Client.
* **Andere Schriften.** Inter, Space Grotesk und Nasalization werden online per
  `@import` geladen. Offline greifen die System-Fallbacks aus dem CSS. Wie sich das
  beheben lässt, steht unter [Schriften einbetten](#schriften-einbetten).

Für den privaten Browsermodus gilt: Dort ist `localStorage` gesperrt, das Quiz
funktioniert, aber die Scores lassen sich nicht speichern. Die Seite sagt das an.

---

## Offline-Version selbst bauen

Nach jeder Änderung an den Quelldateien:

```bash
node build-offline.js
```

Ergebnis: `dist/Planetenquiz-Offline.html`. Benötigt wird nur Node.js — keine
Abhängigkeiten, kein `npm install`.

Das Skript löst die drei Dinge auf, die einen Doppelklick auf `index.html` sonst
scheitern lassen:

| Problem unter `file://` | Lösung im Build |
|---|---|
| `fetch('quizData.json')` wird blockiert | Quizdaten als `<script type="application/json">` eingebettet |
| ES-Module werden blockiert | Skripte als klassische Inline-Blöcke eingebettet |
| relative Bild- und CSS-Pfade | Stylesheet inline, Bilder als Data-URI |

`Planetenquiz.js` bleibt dabei für beide Varianten dieselbe Datei: Sie nutzt die
eingebetteten Daten, wenn vorhanden, und greift sonst auf `quizData.json` zurück.
Es gibt keinen zweiten Codestand, der gepflegt werden müsste.

### Schriften einbetten

Standardmäßig entfernt der Build die beiden `@import`-Zeilen und überlässt die
Darstellung den System-Fallbacks. Sollen die Originalschriften mit in die Datei,
lege die Dateien hier ab:

```
fonts/Inter-400.woff2
fonts/Inter-700.woff2
fonts/Nasalization.woff2
```

Schema: `Familie-Schnitt.woff2`, der Schnitt ist optional (Standard 400). Der Build
bettet alles aus `fonts/` automatisch als `@font-face` ein und meldet es im Protokoll.

> **Lizenzen prüfen.** Inter und Space Grotesk stehen unter der SIL Open Font License
> und dürfen eingebettet und weitergegeben werden. **Nasalization ist kommerziell
> lizenziert** (Typodermic) — das Einbetten in eine weitergegebene Datei gilt als
> Weiterverbreitung und muss von der eigenen Lizenz gedeckt sein.

### Release anlegen

Damit der Download-Button oben funktioniert, gehört die gebaute Datei an ein Release:

1. `node build-offline.js`
2. Auf GitHub → *Releases* → *Draft a new release*, Tag z. B. `v1.0`.
3. `dist/Planetenquiz-Offline.html` als Asset anhängen und veröffentlichen.

Der Button zeigt auf `releases/latest`, ist also nach dem ersten Release dauerhaft
aktuell und muss nie angepasst werden.

---

## Online-Version

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen. Ein Server ist nötig — direktes Öffnen von
`index.html` funktioniert aus den oben genannten Gründen nicht.

Für das Firestore-Leaderboard `firebase-config.example.js` nach `firebase-config.js`
kopieren und die Werte aus der Firebase Console eintragen. Einrichtung von Firestore,
Regeln und anonymer Anmeldung ist im
[Scoreboard-Repo](https://github.com/ProfessorEngineergit/AstroClub-Planetenquiz--Scoreboard)
beschrieben.

---

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Einstieg der Online-Version |
| `Planetenquiz.js` | Quizlogik, Auswertung, Drag and drop, Sprachumschaltung |
| `Planetenquiz.css` | Gestaltung |
| `quizData.json` | Fragen, Antworten, Infotexte, Rückmeldungen (DE/EN) |
| `firebase-score-client.js` | Score-Übermittlung an Firestore (nur online) |
| `local-score-client.js` | Lokales Leaderboard (nur im Offline-Build) |
| `build-offline.js` | Erzeugt `dist/Planetenquiz-Offline.html` |
| `firestore.rules` | Validierungsregeln für die Score-Sammlung |

Fragen und Texte werden ausschließlich in `quizData.json` gepflegt — für neue Fragen
muss kein JavaScript angefasst werden.
