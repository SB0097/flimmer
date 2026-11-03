# Flimmer

Werbefreier YouTube-Player für Android, gebaut mit Expo.

- Keine Werbung, Sponsor-Teile werden per [SponsorBlock](https://sponsor.ajay.app) übersprungen
- Kein Google-Konto nötig; Verlauf, Favoriten, Abos und Playlists werden lokal gespeichert
- Hintergrund-Wiedergabe und Bild-in-Bild
- Lokale Bibliothek: Verlauf mit Sehpositionen, Favoriten und Kanal-Abos
- Kanalseiten und eine persönliche „Für dich“-Startseite ohne Google-Login
- Eigene Playlists mit sortierbaren Videos und fortlaufender Wiedergabe
- Video- und Audio-Downloads für die Offline-Wiedergabe
- Lokaler Import von Abos, Verlauf und Playlists aus Google Takeout
- Untertitel mit Sprachwahl, einschließlich automatisch erzeugter Spuren
- Kompakte Leisten, Flimmer-Logo und Petrol-Akzente im hellen und dunklen Design

## Bibliothek und Startseite

Unter einem Video kannst du es als Favorit markieren und den Kanal abonnieren. Über den
Kanalnamen oder das Kanalbild öffnest du seine Videos. In der Bibliothek findest du Verlauf,
Favoriten und die ungesehenen Videos deiner Abos. Favoriten speichern nur den Eintrag,
nicht die Videodatei; ohne passenden Download brauchst du zum Abspielen eine Internetverbindung.

Der Verlauf beginnt nach fünf abgespielten Sekunden. Positionen werden während der Wiedergabe
regelmäßig sowie beim Pausieren und Wechseln gespeichert, auch im Mini-Player und Hintergrund.
Beim erneuten Öffnen geht es dort weiter; abgeschlossene Videos starten wieder am Anfang.
Einzelne Einträge oder der ganze Verlauf lassen sich in der Bibliothek entfernen.

„Für dich“ mischt neue Abo-Videos, „Nächste Videos“ zu deinem Verlauf und deinen Favoriten
sowie allgemeine Vorschläge. Gesehenes wird ausgefiltert, kurze Abbrüche zählen schwächer,
Favoriten stärker. Kanäle werden gemischt. Sortierung, Abos, Favoriten und Sehpositionen
bleiben auf dem Gerät; zum Abrufen von Videos und Vorschlägen wird YouTube kontaktiert.
Gespeicherte Vorschläge und Bibliothekseinträge bleiben auch ohne Verbindung sichtbar.

Pro Aktualisierung werden höchstens acht länger nicht aktualisierte Abos und sechs
Interessen-Videos abgefragt, mit maximal drei Anfragen gleichzeitig. Bei vielen Abos
werden beim nächsten Aktualisieren weitere Kanäle berücksichtigt. Der Verlauf hält die
letzten 1.000 Videos vor; Favoriten bleiben unabhängig davon erhalten.

## Playlists

Unter **Bibliothek → Meine Playlists** kannst du Listen anlegen, umbenennen und löschen.
Über das Playlist-Symbol an einer Videokachel oder **Speichern** unter dem Player fügst du
ein Video einer oder mehreren Listen hinzu. Auf der Detailseite lässt sich die Reihenfolge
mit den Pfeilen ändern; Entfernen aus einer Playlist lässt Verlauf und Favoriten bestehen.

**Alles abspielen** startet beim ersten Eintrag, Antippen eines Videos an dieser Stelle.
Danach folgt automatisch das nächste Video, auch im Mini-Player und Hintergrund. Im Player
gibt es Vor/Zurück, im Mini-Player einen Knopf für das nächste Video. Am Listenende wird nicht
von vorn begonnen; ein Sleep-Timer kann die Fortsetzung vorher anhalten.

Die gestartete Reihenfolge bleibt für die laufende Wiedergabe erhalten. Änderungen an der
gespeicherten Playlist gelten beim nächsten Start der Liste. Playlists überstehen App-Neustarts;
sie speichern Videoeinträge, keine heruntergeladenen Videodateien. Zum Abspielen ist weiterhin
ohne passenden Download eine Internetverbindung erforderlich.

## Downloads

Über das Download-Symbol an einer Videokachel oder **Download** unter dem Player speicherst
du ein Video (bis 360p oder 720p, je nach verfügbarer Auflösung) oder nur die Tonspur.
Unter **Bibliothek → Downloads** findest du Fortschritt, Speicherverbrauch, Abbrechen,
erneutes Laden und Löschen. Video und Audio können getrennt gespeichert werden.

Bitte Flimmer während des Downloads geöffnet lassen. Die Warteschlange lädt einen Eintrag
nach dem anderen. Nach einem App-Abbruch werden unvollständige Downloads als unterbrochen
angezeigt und lassen sich neu starten; dabei wird die Datei vollständig neu geladen.
Livestreams und geschützte oder nicht unterstützte Stream-Formate sind nicht herunterladbar.

Fertige Downloads spielen ohne Internet im gewohnten Player, auch aus Verlauf und Playlists.
Falls Video und Audio gespeichert sind, wird automatisch das Video bevorzugt; auf der
Download-Seite lässt sich die Tonspur gezielt starten. Sehpositionen, Hintergrund-Wiedergabe
und Sleep-Timer funktionieren weiter. Verfügbare SponsorBlock-Segmente werden beim Download
mitgespeichert. Kommentare und neue Vorschläge stehen offline nicht zur Verfügung.

Die Dateien bleiben im privaten App-Speicher und überstehen App-Updates. Löschen eines
Downloads entfernt nur diese Dateien; Verlauf, Favoriten und Playlists bleiben erhalten.
Eine Deinstallation oder das Löschen der App-Daten entfernt auch die Downloads.

## YouTube-Takeout-Import

Unter **Bibliothek → YouTube-Daten importieren** wählst du dein Takeout-ZIP oder entpackte
Exportdateien aus: Abos als `subscriptions.csv`, Wiedergabeverlauf als JSON oder HTML und
Playlists als CSV. Exportiere bei [Google Takeout](https://takeout.google.com/) nur die
gewünschten YouTube-Daten ohne Videodateien. Es sind höchstens 64 MB auf einmal möglich;
große Archive kannst du vorher entpacken und die gewünschten Dateien einzeln auswählen.

Flimmer zeigt vor dem Hinzufügen eine Vorschau. Die Verarbeitung bleibt auf dem Gerät.
Vorhandene Abos, Playlist-Namen/-Reihenfolgen und Sehpositionen gleicher Videos werden nicht
überschrieben. Derselbe Export kann erneut eingelesen werden, ohne doppelte Einträge anzulegen.
Der Verlauf enthält wie bisher höchstens die 1.000 neuesten unterschiedlichen Videos.

Takeout enthält keine genauen Sehpositionen oder angesehenen Dauern. Importierter Verlauf
wird deshalb gekennzeichnet und als Interesse für „Für dich“ berücksichtigt. Bei unbekannten
HTML-Datumsformaten steht „Zeitpunkt unbekannt“. Fehlende Metadaten von Playlist-Videos
werden beim späteren Öffnen ergänzt. Für den Import ist kein Google-Login in Flimmer nötig.

> 🚧 Frühe Entwicklungsphase

## Untertitel

Im Zahnrad-Menü des Players findest du **Untertitel**. Wähle eine verfügbare Sprache
oder **Aus**. Automatisch erzeugte Spuren sind gekennzeichnet. Ohne verfügbare Spur
zeigt das Menü einen Hinweis; Fehler beim Abruf lassen sich durch erneute Auswahl wiederholen.

Untertitel werden erst bei Auswahl von YouTube geladen und als entbehrliche WebVTT-Datei
im App-Cache gehalten. Der Android-Player zeigt sie auch im Vollbild und in Bild-im-Bild;
die Auswahl bleibt beim Qualitätswechsel und im Mini-Player erhalten. Ein neues Video
beginnt mit ausgeschalteten Untertiteln. Es gibt keine automatische Übersetzung und
keinen Untertitel-Download für die Offline-Bibliothek.

Die Android-Anbindung ergänzt `expo-video` per `patch-package` um externe WebVTT-Spuren.
Deshalb erfordert diese Änderung einen neuen nativen Build; Expo Go reicht nicht aus.

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
