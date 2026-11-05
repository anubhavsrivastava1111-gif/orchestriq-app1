#!/usr/bin/env bash
# Runs Lifeline's native tests with Robolectric (no device or emulator needed).
# Needs: ./lib (mvn -B dependency:copy-dependencies -DoutputDirectory=lib), the build from ../build-apk.sh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; APP="$HERE/../app/src/main"; BUILD="$HERE/../build"
API35="${LIFELINE_API_JAR:-/opt/lifeline-tools/android-all-35.jar}"
OUT="$HERE/out"; rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/cfg/com/android/tools"
[ -f "$BUILD/resources.apk" ] || { echo "Run ../build-apk.sh first" >&2; exit 1; }
cat > "$OUT/cfg/com/android/tools/test_config.properties" <<CFG
android_resource_apk=$BUILD/resources.apk
android_merged_manifest=$APP/AndroidManifest.xml
android_merged_assets=$APP/assets
android_custom_package=com.orchestriq.lifeline
CFG
CP="$(ls "$HERE"/lib/*.jar | tr '\n' ':')"
# androidx.test monitor/idling classes Robolectric needs (built from Google's open-source android-test repo,
# because Google's Maven host was unreachable in the build environment). Override with LIFELINE_AXT_JAR.
CP="$CP${LIFELINE_AXT_JAR:-/opt/lifeline-tools/androidx-test-monitor-src-build.jar}:"
javac --release 17 -encoding UTF-8 -nowarn -cp "$CP$API35" -d "$OUT/classes" \
  $(find "$APP/java" "$BUILD/gen" "$HERE/src" -name '*.java') 2>&1 | grep -v "^Note:\|warning" || true
java -Drobolectric.logging.enabled=false -Drobolectric.offline=true -Drobolectric.dependency.dir="${LIFELINE_TOOLS:-/opt/lifeline-tools}" -Drobolectric.dependency.repo.url=https://maven-central.storage-download.googleapis.com/maven2 -cp "$OUT/classes:$OUT/cfg:$CP$API35" org.junit.runner.JUnitCore com.orchestriq.lifeline.NativeTest
