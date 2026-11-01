#!/usr/bin/env bash
# Build the PROBOSS LUDO WebView wrapper into a signed, installable APK using
# the Android command-line tools (no Gradle required).
#
# Prereqs:  $ANDROID_HOME (or ~/Android/Sdk) with a platform + build-tools,
#           JDK 17, and the site already deployed (see SITE_URL in MainActivity).
#
# Output:   android/dist/PROBOSS-LUDO.apk  (also copied to web/public/app.apk
#           so the website's "Download App" button can serve it).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
SDK_ROOT="$ANDROID_HOME"
PLATFORM="$SDK_ROOT/platforms/android-36"
BT="$(ls -d "$SDK_ROOT"/build-tools/* | sort -V | tail -1)"
OUT="$ROOT/dist"
WEB_PUBLIC="$ROOT/../web/public"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> SDK: $SDK_ROOT | platform: $PLATFORM | build-tools: $BT"

mkdir -p "$OUT"

echo "==> Compiling resources"
"$BT/aapt2" compile --dir "$ROOT/res" -o "$WORK/res.zip"

echo "==> Linking base APK"
"$BT/aapt2" link -o "$WORK/base.apk" \
  -I "$PLATFORM/android.jar" \
  --manifest "$ROOT/AndroidManifest.xml" \
  "$WORK/res.zip"

echo "==> Compiling Java -> dex"
mkdir -p "$WORK/java-out"
javac -source 8 -target 8 -classpath "$PLATFORM/android.jar" -d "$WORK/java-out" \
  "$ROOT"/java/com/probossludo/app/*.java
mkdir -p "$WORK/dex-out"
"$BT/d8" --release --lib "$PLATFORM/android.jar" --min-api 23 \
  --output "$WORK/dex-out" "$WORK"/java-out/com/probossludo/app/*.class

echo "==> Packaging classes.dex"
(cd "$WORK/dex-out" && zip -uq "$WORK/base.apk" classes.dex)

echo "==> Aligning"
"$BT/zipalign" -f 4 "$WORK/base.apk" "$WORK/aligned.apk"

echo "==> Signing"
KS="$ROOT/dist/probossludo.keystore"
if [ ! -f "$KS" ]; then
  echo "    (generating a release keystore — keep this file safe)"
  keytool -genkey -v -keystore "$KS" -alias probossludo -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass proboss123 -keypass proboss123 \
    -dname "CN=PROBOSS LUDO, OU=PROBOSS LUDO, O=PROBOSS LUDO, L=Mumbai, ST=MH, C=IN"
fi
"$BT/apksigner" sign --ks "$KS" --ks-key-alias probossludo \
  --ks-pass pass:proboss123 --key-pass pass:proboss123 \
  --out "$OUT/PROBOSS-LUDO.apk" "$WORK/aligned.apk"

echo "==> Done -> $OUT/PROBOSS-LUDO.apk"
"$BT/apksigner" verify "$OUT/PROBOSS-LUDO.apk" && echo "    signature OK"

if [ -d "$WEB_PUBLIC" ]; then
  cp "$OUT/PROBOSS-LUDO.apk" "$WEB_PUBLIC/app.apk"
  echo "==> Copied to web/public/app.apk (dowloadable from the site)"
fi
ls -lh "$OUT/PROBOSS-LUDO.apk"