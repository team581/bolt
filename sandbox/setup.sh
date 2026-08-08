#!/usr/bin/env bash

set -euo pipefail

seed() {
	local source="$1"
	local destination="$2"
	local partial="$destination.partial.$$"

	[[ -e "$destination" ]] && return 0
	if ! cp --archive "$source" "$partial"; then
		rm --recursive --force "$partial"
		return 1
	fi
	if ! mv -T "$partial" "$destination" 2>/dev/null; then
		rm --recursive --force "$partial"
		[[ -e "$destination" ]]
	fi
}

git config --global user.name "$GITHUB_APP_BOT_NAME"
git config --global user.email "$GITHUB_APP_BOT_EMAIL"
gh auth setup-git --hostname github.com --force
gh auth status --active
java -version
seed /opt/bolt/repositories/offseason-2026 /workspace/offseason-2026
seed /opt/bolt/gradle-home /workspace/.gradle
mkdir --parents /workspace/uploads
if ! timeout 1m git -C /workspace/offseason-2026 pull --ff-only --quiet; then
	printf '%s\n' '[bolt] Failed to update sandbox repository.' >&2
fi
