#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
key_path="$repo_root/android/movie-hub-admin-release.jks"
encoded_path="$key_path.b64"

if ! command -v keytool >/dev/null 2>&1; then
  echo 'Java keytool fehlt. Bitte ein JDK installieren.' >&2
  exit 1
fi
if [ -e "$key_path" ] || [ -e "$encoded_path" ]; then
  echo 'Eine Schlüsseldatei existiert bereits. Sie wird nicht überschrieben.' >&2
  exit 1
fi

echo 'Einen neuen, eigenen Signaturschlüssel für Movie Hub Admin erstellen.'
echo 'Bitte ein langes, dauerhaftes Passwort eingeben und sicher aufbewahren.'
keytool -genkeypair \
  -alias movie-hub-admin \
  -keyalg RSA -keysize 3072 \
  -validity 10000 \
  -storetype PKCS12 \
  -dname 'CN=Movie Hub Admin, O=Movie Hub' \
  -keystore "$key_path"

base64 "$key_path" | tr -d '\n' > "$encoded_path"
chmod 600 "$key_path" "$encoded_path"

echo "Schlüssel erstellt: $key_path"
echo "Base64 für GitHub-Secret MOVIE_HUB_ADMIN_KEYSTORE_BASE64: $encoded_path"
echo 'Das gewählte Passwort gehört in MOVIE_HUB_ADMIN_KEYSTORE_PASSWORD.'
echo 'Schlüsseldatei und Passwort getrennt und dauerhaft sichern. Beide Dateien sind durch .gitignore ausgeschlossen.'
