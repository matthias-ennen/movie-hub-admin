# Movie Hub Admin

Separate Verwaltungsoberfläche für Movie Hub. Die erste Funktion veröffentlicht Mitteilungen für alle angemeldeten Konten. Die normale Movie-Hub-App enthält keine Admin-Rolle und hat keinen Schreibzugriff auf `announcements`.

## Architektur

- Anmeldung über **dasselbe Firebase-Auth-Projekt** wie Movie Hub. Die Oberfläche zeigt den Versand nur bei Custom Claim `movieHubAdmin: true` an.
- `publishAnnouncement` prüft den Claim **serverseitig**, validiert Inhalt und Gültigkeit und schreibt mit dem Admin SDK in Firestore. Ein manipuliertes Web-Frontend kann die Prüfung nicht umgehen.
- `announcements/{id}` enthält `schemaVersion: 1`, `status: published`, `mode: inbox | startup`, `title`, `body`, `startsAt`, `expiresAt`, `createdAt`, `createdBy`. Die Zeitfelder sind Firestore Timestamps. Das Format entspricht Movie-Hub-PR #313.
- Keine Kopie pro Nutzer: Movie Hub liest veröffentlichte Mitteilungen und speichert nur `users/{uid}/announcementReads/{id}`.

## Lokal

Node 22: `npm install`, `cp .env.example .env.local`, Firebase-Web-Konfiguration des vorhandenen Projekts eintragen, `npm run dev`. Für die Funktion: `cd functions && npm install && npm test`.

## Vor Inbetriebnahme

1. Für das eigene Firebase-Auth-Konto den Custom Claim `movieHubAdmin: true` mit einem **vertrauenswürdigen Admin-SDK-Prozess** setzen; anschließend neu anmelden. Niemals einen Service-Account-Schlüssel in dieses Repository oder die Web-App übernehmen. Die Vergabe dieses Claims ist ein einmaliger administrativer Schritt und darf nicht durch die Web-App selbst möglich sein.
2. Cloud Functions für das vorhandene Projekt bereitstellen (`firebase deploy --only functions:movie-hub-admin --project movie-hub-62459`). Das benötigt entsprechende Projektberechtigungen und möglicherweise einen abrechenbaren Firebase-Tarif.
3. Admin-Web-App unter einer **eigenen Hosting-Site/Domain** bereitstellen. Die Konfiguration hier enthält bewusst kein Hosting-Ziel: Ein ungezielter Deploy auf die bestehende Movie-Hub-Site könnte diese überschreiben. Domain in Firebase Auth unter autorisierte Domains eintragen.
4. Firestore-Regeln und Movie-Hub-Client aus PR #313 bereitstellen und End-to-End-Versand mit einem Testkonto und Ablaufdatum prüfen.

Das Repository enthält weder Firebase-Secrets noch ein Verfahren, das sich selbst Admin-Rechte erteilen kann. Das Firebase-Web-Konfigurationsobjekt ist kein geheimer Schlüssel; die Berechtigung wird an der Function durch Auth-Claims geprüft.
