#!/usr/bin/env bash

set -euo pipefail

java -version 2>&1 | grep -E 'version "21([.]|")'
test -x "$JAVA_HOME/bin/java"
test "$GRADLE_USER_HOME" = /workspace/.gradle
test "$GRADLE_RO_DEP_CACHE" = /opt/bolt/gradle-dependencies
git --version
gcloud --version
gh --version
gsutil version
node --version
test -d /opt/bolt/repositories/offseason-2026/.git
test -d /opt/bolt/gradle-dependencies/modules-2
test -d /opt/bolt/gradle-home/wrapper/dists
test -z "$(git -C /opt/bolt/repositories/offseason-2026 status --short --ignored)"
cp -a /opt/bolt/repositories/offseason-2026 /workspace/offseason-2026
cp -a /opt/bolt/gradle-home /workspace/.gradle
cd /workspace/offseason-2026
./gradlew build --offline --no-daemon --build-cache
