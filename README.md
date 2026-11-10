# Merkora

Lernen mit Karteikarten, Lernpfad und KI – als Desktop-App für **Windows, Linux und macOS**.

Merkora ist eine [Tauri](https://tauri.app)-App: der Kern ist in **Rust** geschrieben (Speicherdatei mit täglichen
Sicherungen, Bilder/Töne als Dateien, Anki-Import, KI-Anfragen), die Oberfläche ist eine React-Web-Oberfläche im
nativen Fenster des Systems (WebView2 / WebKit). Installer sind wenige MB groß.

## Funktionen

- Karteikarten mit verteiltem Wiederholen (Lernschritte wie in Anki, siehe unten)
- **Anki-Import** (.apkg/.colpkg, altes und neues Format) inkl. Bildern, Tönen, Schriften, Formeln, Lückentexten,
  **Image Occlusion** und dem **Aussehen der Kartentypen** (CSS) – beim Anlegen eines neuen Decks („Neues Deck › Aus
  Anki-Stapel“), beim Hinzufügen von Karten („Neue Karte“), per Drag & Drop oder Doppelklick auf die Datei
- KI: Karten, Zusammenfassung, Quiz, Podcast, Grafiken, Lernpfad – und ein **eigenes Modell für den Chat**
  (Einstellungen › „KI für den Chat“), z. B. ein schnelles Modell zum Plaudern und ein starkes für die Inhalte
- Anbieter: OpenAI, Anthropic (Claude), Google Gemini, OpenRouter, eigener OpenAI-kompatibler Server (Ollama, LM Studio)

## Wiederholungs-Intervalle

| Karte | Nochmal | Schwer | Gut | Einfach |
| --- | --- | --- | --- | --- |
| neu | 1 Min. | 6 Min. | 10 Min. → 1 Std. → 1 Tag | 3 Tage |
| junge Wiederholung (< 3 Tage) | 10 Min. (neu lernen) | 12 Std. | × Leichtigkeit | × Leichtigkeit × 1,3 |
| ältere Wiederholung | 10 Min. (neu lernen) | × 1,2 | × Leichtigkeit | × Leichtigkeit × 1,3 |

Karten in einem kurzen Lernschritt kommen in derselben Lernrunde wieder.

## Entwickeln

Voraussetzungen: [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) und die
[Tauri-Voraussetzungen](https://tauri.app/start/prerequisites/) deines Systems.

```bash
npm install
npm run desktop:dev     # App mit Live-Reload starten
npm run desktop         # Installer bauen → src-tauri/target/release/bundle/
npm run test:srs && npm run test:anki
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Optional: kostenlose Standard-KI. Lege `.env.local` mit `VITE_MERKORA_FREE_KEY=<OpenRouter-Key>` an (wird nie
eingecheckt). Builds mit eingebautem Key nicht öffentlich weitergeben – der Key lässt sich aus der App auslesen.

## Builds für alle Systeme

GitHub Actions (`.github/workflows/build.yml`) baut bei jedem Push Installer für Windows, Linux und macOS
(Apple Silicon) als Download-Artefakte. Ein Tag wie `v0.2.0` erstellt zusätzlich einen Release-Entwurf.

## Daten

Lernstand, Sicherungen (14 Tage) und Medien liegen in
`%APPDATA%\Merkora` (Windows), `~/Library/Application Support/Merkora` (macOS) bzw. `~/.config/Merkora` (Linux).
