---
name: access-fetch-logs
description: Find Team 581 WPILOG files and their run metadata in the Fetch GCS bucket. Use when a user asks to analyze a robot log that was not attached, identifies a match or recording, or asks about Fetch-hosted logs.
license: MIT
---

# Access Fetch logs

Fetch's read-only GCS bucket is mounted at `/workspace/fetch` in Bolt's sandbox.

## Bucket layout

- `/workspace/fetch/team_0581/logs/*.wpilog` contains Team 581 robot logs.
- `/workspace/fetch/team_0581/videos/*.mp4` contains field-side recordings, which shouldn't be used for any analysis.
- `/workspace/fetch/manifests/*.json` indexes both artifact types.

Manifest fields include `team`, `type`, `filename`, `path`, `uploaded_at`, and optional run/pairing metadata such as `enable_runs`, `matched_log`, and `pairing`.

## Resolve a request to a log

1. For a match number, search log filenames for its event code. For example, qualification 49 ends in `_Q49.wpilog` and elimination 3 ends in `_E3.wpilog`.
2. For a video filename or recording time, find its video manifest and use `matched_log` to select the corresponding WPILOG.
3. If multiple event codes or logs still match, ask one focused question before analyzing anything.
4. Read the selected WPILOG directly from the mount; it does not need to be copied into `/workspace/uploads`.

Once the log is resolved, use the analyze-wpilog skill for parsing and analysis.
