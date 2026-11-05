#!/usr/bin/env bash
# Builds a signed, installable Lifeline APK without Android Studio.
#
# Tools (all from official Ubuntu packages + Maven Central):
#   apt-get install aapt zipalign apksigner dalvik-exchange android-sdk-platform-23
#   Android 15 framework jar (compile-time API surface):
#   https://repo.maven.apache.org/maven2/org/robolectric/android-all/15-robolectric-12650502/android-all-15-robolectric-12650502.jar
#
# Usage:
#   LIFELINE_KS_PASS=... ./android/build-apk.sh            # release build signed with your keystore
#   LIFELINE_KEYSTORE=path/to/key.jks (default ~/.lifeline/lifeline-release.jks)
#
# Output: android/build/Lifeline.apk
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TOOLS="${LIFELINE_TOOLS:-/opt/lifeline-tools}"
API35="${LIFELINE_API_JAR:-$TOOLS/android-all-35.jar}"
API23="/usr/lib/android-sdk/platforms/android-23/android.jar"
KEYSTORE="${LIFELINE_KEYSTORE:-$HOME/.lifeline/lifeline-release.jks}"
KS_ALIAS="${LIFELINE_KS_ALIAS:-lifeline}"
OUT="$HERE/build"
SRC="$HERE/app/src/main"

: "${LIFELINE_KS_PASS:?Set LIFELINE_KS_PASS to the keystore password}"
for f in "$API35" "$API23" "$KEYSTORE"; do [ -f "$f" ] || { echo "Missing: $f" >&2; exit 1; }; done

echo "▸ 1/7 Building the interface (web assets)"
(cd "$ROOT" && npx vite build --config vite.android.config.ts --logLevel warn)

rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes"

echo "▸ 2/7 Packaging resources"
aapt package -f -m -J "$OUT/gen" -M "$SRC/AndroidManifest.xml" -S "$SRC/res" -A "$SRC/assets" \
  -I "$API23" -F "$OUT/resources.apk" --no-version-vectors

echo "▸ 3/7 Compiling Java"
javac --release 8 -encoding UTF-8 -Xlint:all,-options,-deprecation,-classfile -cp "$API35" -d "$OUT/classes" \
  $(find "$SRC/java" "$OUT/gen" -name '*.java')

echo "▸ 4/7 Checking bytecode is safe for Android (no lambdas/invokedynamic)"
if javap -c -p -cp "$OUT/classes" $(cd "$OUT/classes" && find . -name '*.class' | sed 's#^\./##; s#\.class$##; s#/#.#g') | grep -q invokedynamic; then
  echo "invokedynamic found — remove lambdas/method references" >&2; exit 1
fi

echo "▸ 5/7 Converting to Android bytecode"
dalvik-exchange --dex --min-sdk-version=26 --output="$OUT/classes.dex" "$OUT/classes"

echo "▸ 6/7 Assembling and aligning"
cp "$OUT/resources.apk" "$OUT/unsigned.apk"
(cd "$OUT" && aapt add unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "▸ 7/7 Signing"
apksigner sign --ks "$KEYSTORE" --ks-key-alias "$KS_ALIAS" --ks-pass env:LIFELINE_KS_PASS \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT/Lifeline.apk" "$OUT/aligned.apk"
apksigner verify "$OUT/Lifeline.apk"
rm -f "$OUT/unsigned.apk" "$OUT/aligned.apk" "$OUT/Lifeline.apk.idsig"

echo "✓ $OUT/Lifeline.apk ($(du -h "$OUT/Lifeline.apk" | cut -f1))"
apksigner verify --print-certs "$OUT/Lifeline.apk" | grep -i "SHA-256" | head -1
