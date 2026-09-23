# Movie Hub Admin

Separate Verwaltungsoberfläche für Movie Hub. Die erste Funktion veröffentlicht Mitteilungen für alle angemeldeten Konten. Die normale Movie-Hub-App enthält keine Admin-Rolle und hat keinen Schreibzugriff auf `announcements`.

## Architektur

- Anmeldung über **dasselbe Firebase-Auth-Projekt** wie Movie Hub. Die Oberfläche zeigt den Versand nur bei Custom Claim `movieHubAdmin: true` an.
- `publishAnnouncement` prüft den Claim **serverseitig**, validiert Inhalt und Gültigkeit und schreibt mit dem Admin SDK in Firestore. Ein manipuliertes Web-Frontend kann die Prüfung nicht umgehen.
- `announcements/{id}` enthält `schemaVersion: 1`, `status: published`, `mode: inbox | startup`, `title`, `body`, `startsAt`, `expiresAt`, `createdAt`, `createdBy`. Die Zeitfelder sind Firestore Timestamps. Das Format entspricht Movie-Hub-PR #313.
- Keine Kopie pro Nutzer: Movie Hub liest veröffentlichte Mitteilungen und speichert nur `users/{uid}/announcementReads/{id}`.

## Lokal

Node 22: `npm install`, `cp .env.example .env.local`, lokal die Firebase-Web-Konfiguration des vorhandenen Projekts eintragen, `npm run dev`. Für die Funktion: `cd functions && npm install && npm test`. Auf Firebase Hosting lädt die App die Web-Konfiguration automatisch über `/__/firebase/init.json` und prüft die Projekt-ID.

## Vor Inbetriebnahme

1. Für das **bestehende Movie-Hub-Konto** den Claim `movieHubAdmin: true` einmalig vergeben. In einer berechtigten Umgebung mit Application Default Credentials im Verzeichnis `functions` erst `node scripts/grantAdmin.js --email <Adresse>` als Vorschau ausführen. Angezeigte UID prüfen; dann `node scripts/grantAdmin.js --email <Adresse> --apply-uid <UID>`. Der Vorgang erhält andere bestehende Claims. Die Berechtigung bleibt an der UID, auch wenn sich die E-Mail-Adresse später ändert. Anschließend neu anmelden. Niemals einen Service-Account-Schlüssel in dieses Repository oder die Web-App übernehmen.
2. Das eigene Laufzeit-Dienstkonto und die Berechtigungen für die Function wie unten beschrieben einrichten. Dann den manuellen Workflow **Deploy Movie Hub Admin** mit `target=functions` ausführen. Das Projekt benötigt einen abrechenbaren Firebase-Tarif.
3. Die Admin-Web-App ist auf der separaten Hosting-Site `movie-hub-admin-62459` bereits veröffentlicht: `https://movie-hub-admin-62459.web.app/`. Der Workflow kann sie mit `target=hosting` aktualisieren. Falls später OAuth-Anmeldung hinzukommt, die Domain zusätzlich unter Firebase Auth → Autorisierte Domains eintragen.
4. Firestore-Regeln und Movie-Hub-Client aus PR #313 bereitstellen und End-to-End-Versand mit einem Testkonto und Ablaufdatum prüfen.

### Bereitstellungszugriff

Der CI-Prüflauf vom 23.09.2026 hat bestätigt, dass der bestehende Google-Cloud-Workload-Identity-Provider GitHub Actions aus `matthias-ennen/movie-hub-admin` durch seine Attributbedingung ablehnt. Dieser Provider und das Dienstkonto `github-movie-hub-deploy` bleiben ausschließlich für die normale App. Sie verwalten auch Firebase-Regeln und Firestore-Metadaten und werden nicht für das Admin-Repository geöffnet.

Der manuelle Workflow **Deploy Movie Hub Admin** erwartet einen **eigenen** Pool `movie-hub-admin-github`, darin den OIDC-Provider `github` (Issuer `https://token.actions.githubusercontent.com/`) und das Dienstkonto `github-movie-hub-admin-deploy@movie-hub-62459.iam.gserviceaccount.com`. Im Provider `google.subject=assertion.sub` zuordnen und als Attributbedingung `assertion.sub=='repo:matthias-ennen@208120220/movie-hub-admin@1383209480:ref:refs/heads/main'` verwenden. Ausschließlich demselben **unveränderlichen** GitHub-OIDC-Subject `repo:matthias-ennen@208120220/movie-hub-admin@1383209480:ref:refs/heads/main` auf **diesem neuen Dienstkonto** die Rolle Workload Identity User erteilen. Für nach dem 15.07.2026 erstellte GitHub-Repositories enthält `sub` standardmäßig diese IDs; das Subject beim ersten Authentifizierungsversuch prüfen, bevor Rechte ausgeweitet werden. Dadurch bleiben PR-Builds ohne Firebase-Deployment-Zugriff. Keine dauerhaften Service-Account-Schlüssel anlegen.

Das Hosting-Deployment auf der eigenen Site wurde mit dem Admin-Deploy-Dienstkonto erfolgreich ausgeführt. Auf Projektebene hat dieses Dienstkonto bereits **Firebase Hosting Admin** (`roles/firebasehosting.admin`) und **API Keys Viewer** (`roles/serviceusage.apiKeysViewer`). Der manuelle Workflow stellt mit `target=hosting` nur `hosting:admin` bereit; `target=functions` stellt nur `functions:movie-hub-admin` bereit. Deployments starten ausschließlich von `main`.

Für die erste Function-Bereitstellung:

1. Das neue Dienstkonto `movie-hub-admin-runtime@movie-hub-62459.iam.gserviceaccount.com` für die Laufzeit erstellen, ohne Schlüsseldatei. Ihm im Projekt `movie-hub-62459` **Cloud Datastore User** (`roles/datastore.user`) zuweisen, damit die Function in Firestore schreiben kann. Diese Rolle erlaubt Zugriff auf Daten der Firestore-Datenbank; sie beschränkt sich nicht auf `announcements`. Die Function prüft deshalb den Admin-Claim vor jedem Schreibzugriff.
2. Dem bestehenden Admin-Deploy-Dienstkonto auf Projektebene **Cloud Functions Developer** (`roles/cloudfunctions.developer`) zuweisen. Auf dem **neuen Laufzeit-Dienstkonto** diesem Deploy-Dienstkonto **Service Account User** (`roles/iam.serviceAccountUser`) zuweisen, nicht pauschal auf Projektebene. Der Code setzt dieses Laufzeitkonto ausdrücklich als `serviceAccount`, damit die Function nicht mit den möglicherweise breiten Rechten des Standard-Compute-Kontos läuft.
3. Die in diesem Projekt tatsächlich verwendete **Cloud Build-Dienstidentität** prüfen. Für das Deployment muss das Deploy-Dienstkonto auch auf dieser konkreten Build-Dienstidentität `roles/iam.serviceAccountUser` besitzen. Die Build-Dienstidentität benötigt `roles/cloudbuild.builds.builder` auf dem Projekt. Google hat die Standardidentität für neuere Projekte geändert; daher keine E-Mail-Adresse erraten und keine pauschale Service-Account-User-Rolle auf Projektebene vergeben.
4. Änderung auf `main` übernehmen, danach den manuellen Workflow **Deploy Movie Hub Admin** mit `target=functions` starten. Fehlende API-Aktivierungen oder Berechtigungen anhand der konkreten Fehlermeldung ergänzen und den Deploy erneut prüfen. Die separate Hosting-Site und die normale Movie-Hub-App werden hierbei nicht erneut bereitgestellt.

Die Berechtigungsaufteilung folgt der [Firebase-Dokumentation zum Laufzeitkonto](https://firebase.google.com/docs/functions/manage-functions#set_a_service_account), den [Google-Cloud-Deployrollen](https://docs.cloud.google.com/functions/docs/reference/iam/roles#permissions) und den [Firestore-IAM-Rollen](https://docs.cloud.google.com/firestore/native/docs/security/iam#predefined_roles).

Das Repository enthält weder Firebase-Secrets noch ein Verfahren, das sich selbst Admin-Rechte erteilen kann. Das Firebase-Web-Konfigurationsobjekt ist kein geheimer Schlüssel; die Berechtigung wird an der Function durch Auth-Claims geprüft.

## Android-App und Aktualisierungen

Die Android-App ist ein kleiner WebView-Wrapper für die **eigene Admin-Hosting-Adresse**. Sie öffnet nur die fest eingetragene HTTPS-Domain. Die Bildschirmbezeichnung lautet wie bei der normalen App **Movie Hub**; das Admin-Icon ist die vom Nutzer ausgewählte erste Variante mit blauem Zahnrad. Der Android-Paketname `de.matthiasennen.moviehubadmin` ist von `de.matthiasennen.moviehub` getrennt, damit beide Apps nebeneinander installiert werden können.

Der Workflow **Android APK** erstellt bei jedem Lauf eine Test-APK. Diese Debug-APK ist wegen wechselnder CI-Debug-Signaturen **nicht** für dauerhaftes Aktualisieren bestehender Installationen gedacht. Die dauerhaft aktualisierbare Release-APK verwendet einen **eigenen Signaturschlüssel für die Admin-App**. Sie entsteht, sobald folgende Werte im Admin-Repository eingerichtet sind:

- Ein dauerhaft verwahrter eigener Release-Keystore mit Alias `movie-hub-admin`; GitHub-Secrets `MOVIE_HUB_ADMIN_KEYSTORE_BASE64` und `MOVIE_HUB_ADMIN_KEYSTORE_PASSWORD` (Passwort für Store und Schlüssel). Keystore und Passwort niemals einchecken. Der gleiche Keystore muss bei allen späteren Builds verwendet werden.
- Die fest zugeordnete Hosting-Adresse `https://movie-hub-admin-62459.web.app/` ist im Build hinterlegt.

### Schlüssel einmalig einrichten

Auf einem **eigenen Rechner mit Java JDK** `bash scripts/create-android-signing-key.sh` ausführen. Das Programm fragt das neue Passwort verdeckt über `keytool` ab und legt `android/movie-hub-admin-release.jks` und eine Base64-Textdatei daneben an. Es überschreibt einen vorhandenen Schlüssel nicht. Die Dateien sind vom Git-Commit ausgeschlossen.

Im Admin-Repository unter **Settings → Secrets and variables → Actions** zwei *Repository secrets* hinterlegen: den gesamten Inhalt der `.jks.b64`-Datei als `MOVIE_HUB_ADMIN_KEYSTORE_BASE64` und das gewählte Passwort als `MOVIE_HUB_ADMIN_KEYSTORE_PASSWORD`. Schlüsseldatei und Passwort zusätzlich getrennt und dauerhaft sichern; **nicht im Chat oder in einem Issue teilen**. Die Base64-Datei nach dem Eintragen sicher vom Arbeitsrechner entfernen. Mit der fest hinterlegten Hosting-Adresse liefert der Android-Workflow eine signierte Release-APK. Android akzeptiert spätere APK-Updates nur mit **demselben Schlüssel**.

Der Paketname bleibt konstant; `versionCode` steigt mit der GitHub-Actions-Laufnummer des Admin-Workflows. So lässt sich eine neuere **Release-APK über eine ältere Release-APK installieren**, ohne die Admin-App zu löschen. Ein Wechsel des Schlüssels oder Paketnamens würde diese Update-Kette unterbrechen. Die normale und die Admin-App haben voneinander unabhängige Schlüssel. Das Admin-Frontend wird separat auf Hosting aktualisiert und braucht für reine Web-Änderungen keine neue APK.
