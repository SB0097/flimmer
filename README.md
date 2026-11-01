# Flimmer

Werbefreier YouTube-Player für Android, gebaut mit Expo.

- Keine Werbung, Sponsor-Teile werden per [SponsorBlock](https://sponsor.ajay.app) übersprungen
- Kein Google-Konto nötig, alle Daten bleiben auf dem Gerät
- Hintergrund-Wiedergabe und Bild-in-Bild

> 🚧 Frühe Entwicklungsphase

## Tech-Stack

Expo SDK 58 · React Native 0.88 · TypeScript · expo-router · [YouTube.js](https://github.com/LuanRT/YouTube.js) · EAS Build

## Branches

```
feature/xyz ──PR──▶ test ──PR──▶ main
```

| Branch      | Zweck                              | App-Variante                 |
| ----------- | ---------------------------------- | ---------------------------- |
| `main`      | stabile, getestete Versionen       | **Flimmer**                  |
| `test`      | Integration und Test auf dem Handy | **Flimmer Test**             |
| `feature/…` | ein Branch pro Feature oder Fix    | **Flimmer Dev** (Dev-Client) |

- Neue Features entstehen in `feature/<name>` (von `test` abzweigen) und kommen per **Pull Request nach `test`**.
- Nach dem Test auf dem Handy kommt `test` per **Pull Request nach `main`**.
- Direkte Pushes auf `test` und `main` sind tabu. Die CI prüft jeden PR (Typecheck, Lint, Format, Tests).

Die drei App-Varianten (Dev, Test, stabil) haben eigene App-IDs und lassen sich gleichzeitig installieren.

## Entwicklung

```bash
npm install
npm start          # Metro-Server für den Dev-Client ("Flimmer Dev")
npm run typecheck
npm run lint
npm test
```

## APK bauen (EAS Build, manuell)

Auf GitHub: **Actions → EAS Build → Run workflow**, Branch und Profil wählen:

| Profil        | Branch   | App          |
| ------------- | -------- | ------------ |
| `test`        | `test`   | Flimmer Test |
| `production`  | `main`   | Flimmer      |
| `development` | beliebig | Dev-Client   |

Die fertige APK gibt es auf expo.dev unter dem Projekt `flimmer` → Builds (Download-Link bzw. QR-Code). Voraussetzung ist das Secret `EXPO_TOKEN` im Repo.

Alternativ lokal: `npx eas-cli@latest build -p android --profile test`

## Lizenz

[GPL-3.0](LICENSE). Dieses Projekt steht in keiner Verbindung zu YouTube oder Google.
