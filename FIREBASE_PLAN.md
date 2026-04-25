# Plan: Planeten-Quiz mit Google Firebase + Scoreboard-Website

> Stand: 2026-04-25 · Ziel: kostenlos, ohne eigenen Server, mit öffentlicher Highscore-Liste.

---

## 1. Sind die Fragen immer gleich?

**Aktuell: Ja.** Alle Fragen, Antwortmöglichkeiten und die richtigen Lösungen stehen statisch in `quizData.json`. Beim Laden zieht sich die Seite einmalig diese Datei und rendert sie. Reihenfolge der Fragen, Reihenfolge der Antworten, alles fix.

**Konsequenzen:**
- Wer das Quiz zweimal macht, bekommt exakt dieselben Fragen in derselben Reihenfolge.
- Wer den HTML-Quelltext oder `quizData.json` öffnet, sieht direkt im JSON das Feld `"correct": 2` etc. — die Lösung ist im Klartext im Browser.
- Für eine reine Vortrag-/Lern-Demo ist das okay. Für ein "ernstes" Scoreboard ist es eine offene Tür.

**Wenn du willst, dass Fragen variieren oder fairer sind, kommen drei Stufen in Frage:**

1. **Shuffeln im Browser** (5 Min Aufwand): Fragen und/oder Antworten beim Rendern zufällig sortieren. Lösung steht aber weiter im JSON.
2. **Fragen aus Firestore laden** (1 h): `quizData.json` wandert in eine Firestore-Collection. Die Lösung steht trotzdem im Browser, weil das Quiz die Korrektheit clientseitig prüft. Hilft nur für einfaches Verwalten/Ergänzen ohne Code-Push.
3. **Auswertung serverseitig in einer Firebase Cloud Function** (Vormittag): Der Browser schickt nur die Auswahl, die Function prüft, gibt den Score zurück und schreibt ihn ins Scoreboard. Erst hier ist die Lösung wirklich versteckt. Achtung: Cloud Functions brauchen den **Blaze-Plan** (Pay-as-you-go), der aber bei kleiner Nutzung im kostenlosen Kontingent bleibt.

Mein Vorschlag fürs Erste: **Stufe 1 + 2** — Fragen in Firestore, im Browser geshuffelt, Score wird vertrauensvoll vom Browser gemeldet. Reicht für AstroClub-Vorträge, ist gratis (Spark-Plan), und in einem Nachmittag gebaut. Stufe 3 ergänzt man, sobald jemand das Scoreboard manipuliert.

---

## 2. Architektur-Überblick

```
┌─────────────────────┐         ┌────────────────────────┐
│  Quiz-Seite         │         │  Scoreboard-Seite       │
│  (index.html)       │         │  (scoreboard.html)      │
│                     │         │                         │
│  - liest Fragen     │  read   │  - liest Top-N Scores   │
│  - sammelt Antwort  │ ──────▶ │  - live-aktualisiert    │
│  - schreibt Score   │         │                         │
└──────────┬──────────┘         └───────────▲─────────────┘
           │                                │
           │  write score                   │  read scores
           ▼                                │
        ┌─────────────────────────────────────┐
        │           Firebase Firestore         │
        │                                      │
        │  /questions   (optional, später)     │
        │  /scores      {name, score, date}    │
        └─────────────────────────────────────┘
```

Beides sind statische HTML/JS-Seiten. Hosting + Datenbank kommen von Firebase, **kein eigener Server nötig**.

---

## 3. Was ist gratis, was nicht?

**Spark-Plan (komplett gratis, ohne Kreditkarte):**
- Firestore: 50.000 Lesungen/Tag, 20.000 Schreibungen/Tag, 1 GiB Speicher → für Vereinsgrößen nie ausgeschöpft.
- Firebase Hosting: 10 GB Traffic/Monat, 360 MB/Tag → reicht locker für das Quiz.
- Authentication (anonym oder Google-Login): unbegrenzt im Spark-Plan.

**Blaze-Plan (Pay-as-you-go, Kreditkarte nötig):**
- Erst nötig, wenn du **Cloud Functions** willst (also Stufe 3, serverseitige Auswertung).
- Innerhalb der Free-Tier-Grenzen weiterhin 0 €. Du zahlst nur, wenn du sie überschreitest. Für ein Schul-/Vereinsquiz praktisch nie.

Empfehlung für den Start: **Spark-Plan**. Upgrade nur, wenn du Cloud Functions wirklich brauchst.

---

## 4. Schritt-für-Schritt-Aufbau

### 4.1 Firebase-Projekt einrichten (10 min)
1. Auf [console.firebase.google.com](https://console.firebase.google.com) mit Google-Account einloggen.
2. **„Projekt hinzufügen"** → Name z. B. `astroclub-planetenquiz` → Google-Analytics deaktivieren (für die Größe unnötig) → Erstellen.
3. Linke Spalte: **Build → Firestore Database** → "Datenbank erstellen" → **Production-Modus** wählen → Region `eur3 (europe-west)` (für DSGVO und niedrige Latenz in DE).
4. Linke Spalte: **Build → Authentication** → "Loslegen" → Anbieter "Anonym" aktivieren. (Damit kann jeder Quiz-Spieler anonym schreiben, ohne Konto.)
5. Oben links Zahnrad → "Projekteinstellungen" → unter "Meine Apps" auf das `</>`-Symbol klicken → Web-App registrieren → Name z. B. `quiz-frontend` → Hosting NICHT mitsetzen lassen (machen wir später) → den `firebaseConfig`-Block kopieren und sicher zwischenspeichern.

### 4.2 Datenmodell in Firestore

**Collection `scores`** (für das Scoreboard):
```
/scores/{auto-id}
    name      : string  (z. B. "Bahrian", max 30 Zeichen)
    score     : number  (0–160, ganze Zahl)
    date      : timestamp
    duration  : number  (optional: Sekunden, falls du eine Zeitwertung willst)
    lang      : string  ("de" | "en")
```

**Collection `questions`** (optional, falls Stufe 2 gewünscht):
```
/questions/{auto-id}
    order     : number  (zur Sortierung)
    id        : string  ("frage1" usw., bleibt kompatibel)
    de        : { question: string, answers: [string,string,string,string] }
    en        : { question: string, answers: [string,string,string,string] }
    correct   : number  (0–3)  — Achtung: weiterhin clientseitig sichtbar
```

Tipp: Wenn du auf Stufe 3 (serverseitige Auswertung) gehst, packst du `correct` in eine **separate Collection `answers/`**, die nur Cloud Functions lesen dürfen — und für Clients per Firestore-Regel komplett gesperrt ist.

### 4.3 Firestore Security Rules (wichtig — sonst kann jeder alles)

In der Firebase-Konsole: Firestore → Regeln → folgendes einsetzen:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Fragen: jeder darf lesen, niemand schreiben
    match /questions/{doc} {
      allow read: if true;
      allow write: if false;
    }

    // Scores: jeder authentifizierte (auch anonym) darf schreiben,
    // aber nur einen plausiblen Datensatz. Lesen offen für Scoreboard.
    match /scores/{doc} {
      allow read: if true;
      allow create: if request.auth != null
                    && request.resource.data.score is number
                    && request.resource.data.score >= 0
                    && request.resource.data.score <= 160
                    && request.resource.data.name is string
                    && request.resource.data.name.size() >= 1
                    && request.resource.data.name.size() <= 30
                    && request.resource.data.date == request.time;
      allow update, delete: if false;
    }
  }
}
```

Das verhindert die schlimmsten Cheats (Scores > 160, leere Namen, Manipulation alter Einträge), aber **nicht** das Schreiben falscher Scores aus dem Browser. Dafür brauchst du Stufe 3.

### 4.4 Code-Integration ins Quiz (Stufe 1+2)

In `index.html` vor dem `</body>`:

```html
<script type="module">
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
  import { getFirestore, collection, addDoc, serverTimestamp,
           query, orderBy, limit, getDocs }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
  import { getAuth, signInAnonymously }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

  const firebaseConfig = { /* deinen Block aus 4.1 hier rein */ };
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);
  const auth = getAuth(app);
  await signInAnonymously(auth);

  // Globale Hilfsfunktion, die Planetenquiz.js aufrufen kann:
  window.submitScore = async (name, score, lang) => {
    await addDoc(collection(db, 'scores'), {
      name: String(name).slice(0, 30),
      score: Number(score),
      lang,
      date: serverTimestamp()
    });
  };
</script>
```

In `Planetenquiz.js` am Ende von `checkAnswers()` (nach Berechnung von `Newscore`) ein **kleiner, nicht-funktionsverändernder** Zusatz: vor dem Submit den Namen abfragen und an `window.submitScore` übergeben. Beispiel:

```js
const name = prompt(currentLang === 'de' ? 'Name fürs Scoreboard?' : 'Name for the scoreboard?');
if (name && window.submitScore) {
    window.submitScore(name, Newscore, currentLang).catch(console.error);
}
```

Das ist optional und ändert nichts am bestehenden Quiz-Flow. Ohne Eingabe wird einfach kein Score gespeichert.

### 4.5 Scoreboard-Seite

Neue Datei `scoreboard.html` mit gleichem Stylesheet, simple Liste:

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <title>Scoreboard – Planeten-Quiz</title>
  <link rel="stylesheet" href="Planetenquiz.css">
</head>
<body>
<div class="container">
  <div class="text-box header-box">
    <img src="AstroClub_logo.jpg" alt="AstroClub Logo" class="logo">
    <h1>Scoreboard</h1>
  </div>
  <div class="text-box">
    <h2 style="text-align:center; margin-bottom:18px;">Top 20</h2>
    <ol id="board" style="padding-left: 1.4em; line-height: 1.9;"></ol>
  </div>
  <a class="action-button" href="index.html">Zum Quiz</a>
</div>

<script type="module">
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
  import { getFirestore, collection, query, orderBy, limit, getDocs }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

  const firebaseConfig = { /* derselbe Block */ };
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  const q = query(collection(db, 'scores'), orderBy('score', 'desc'), limit(20));
  const snap = await getDocs(q);
  const board = document.getElementById('board');
  snap.forEach(doc => {
    const d = doc.data();
    const li = document.createElement('li');
    li.textContent = `${d.name} — ${d.score} Punkte`;
    board.appendChild(li);
  });
</script>
</body>
</html>
```

Optional: statt `getDocs` einmalig laden, kannst du `onSnapshot` nehmen — dann aktualisiert sich das Scoreboard live, sobald jemand fertig wird. Hübscher Effekt für Vorträge.

### 4.6 Hosting (gratis)
1. `npm install -g firebase-tools` (einmalig).
2. Im Projektordner `firebase login` und `firebase init hosting` → Public-Verzeichnis: `.` (oder `public/`, je nachdem ob du umorganisieren willst).
3. `firebase deploy` — danach hat deine Seite eine `https://astroclub-planetenquiz.web.app`-Adresse.

### 4.7 Stufe 3 (optional, später) — sicheres Scoring

Wenn das Scoreboard wirklich vertrauenswürdig sein muss:
- Auf Blaze-Plan wechseln.
- Cloud Function `evaluateQuiz(answers, dragOrder, lang) → score` schreiben, die `correct` aus einer geschützten Collection liest und den Score berechnet.
- Im Browser nur noch die Antworten an die Function schicken, Function schreibt Score selbst nach `/scores`.
- Firestore-Regel auf `/scores`: `allow create: if false;` — nur Functions können noch schreiben.

---

## 5. Was ich an deiner Stelle tun würde

1. **Heute:** Firebase-Projekt anlegen (4.1), Firestore + Anonym-Auth einrichten, Security Rules setzen (4.3) — ~20 Min.
2. **Morgen:** Submit-Hook in `Planetenquiz.js` (4.4) und `scoreboard.html` (4.5) bauen, lokal testen — ~1 h.
3. **Übermorgen:** `firebase deploy` (4.6), Link an die AstroClub-Leute schicken — ~10 Min.
4. **Erst wenn jemand cheatet:** Stufe 3 nachschieben.

---

## 6. Stolperfallen, die mir schon Stunden gekostet haben

- **`firebaseConfig` ist nicht geheim**, sondern darf öffentlich im JS stehen (Google nennt es selbst "API key" — das ist eher ein Projekt-Identifier). Geheim sind die **Security Rules**, die schützen die Daten.
- **CORS / lokales Testen**: `file://` funktioniert nicht. Lokal mit `python3 -m http.server` oder `firebase serve` starten.
- **Region**: einmal gesetzt, kann Firestore nicht migriert werden. Lieber direkt `eur3` nehmen.
- **Anonyme Auth**: das Token läuft alle 1 h ab; das SDK refresht aber automatisch. Kein eigener Code nötig.
- **`request.time` in den Rules**: nur akzeptieren, wenn der Client `serverTimestamp()` schickt — sonst kannst du mit gefälschten Datumswerten Einträge nach oben ranken.
