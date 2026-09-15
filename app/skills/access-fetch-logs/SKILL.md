---
name: access-fetch-logs
description: Find Team 581 WPILOG files, run metadata, and canvas notes in the Fetch GCS bucket. Use when a user asks about a Fetch-hosted log, match, recording, canvas, survey, metric, or timestamped note.
license: MIT
---

# Access Fetch logs and canvases

Fetch's read-only GCS bucket is mounted at `/workspace/fetch` in Bolt's Junior sandbox. The mount is restored whenever a persistent sandbox resumes.

## Bucket layout

- `/workspace/fetch/team_0581/logs/*.wpilog` contains Team 581 robot logs.
- `/workspace/fetch/team_0581/videos/*.mp4` contains field-side recordings, which shouldn't be used for any analysis.
- `/workspace/fetch/manifests/*.json` indexes both artifact types.
- `/workspace/fetch/metric-runs/<team>/<season>.json` contains the canvases attached to runs and recordings.
- `/workspace/fetch/metric-catalogs/<team>/<season>.json` defines the metrics referenced by canvases.
- `/workspace/fetch/comments/*.json` contains the legacy video-comment records.

Manifest fields include `team`, `type`, `filename`, `path`, `uploaded_at`, and optional run/pairing metadata such as `enable_runs`, `matched_log`, and `pairing`.

## Resolve a request to a log

1. For a match number, search log filenames for its event code. For example, qualification 49 ends in `_Q49.wpilog` and elimination 3 ends in `_E3.wpilog`.
2. For a video filename or recording time, find its video manifest and use `matched_log` to select the corresponding WPILOG.
3. If multiple event codes or logs still match, ask one focused question before analyzing anything.
4. Read the selected WPILOG directly from the mount; it does not need to be copied into `/workspace/uploads`.

Once the log is resolved, use the analyze-wpilog skill for parsing and analysis.

## Read Fetch canvases

- Read the team's `metric-runs` and matching `metric-catalogs` season files directly
- `runs`: object keyed by run ID. Resolve recordings/logs through `sourceRefs`, `targetKey`, and `snapshot`.
- Common refs: `<team>|video-name|<filename>`, `<team>|video|<path>`, `<team>|log|<filename>`.
- `canvases[].content`: authoritative Tiptap document in schema v3; use when order or rich-text structure matters.
- `canvases[].nodes`: flat compatibility index for compact extraction:
  - `text`: note text; `@0:12` and `@[1:09]` are video timestamps; annotations may preserve the original author.
  - `metric`: keep `value`, `expression`, and `evidence`; join `metricId` to the catalog for name, type, choices, and unit.
  - `comment`: legacy reference; deduplicate against canvas annotations and `/comments` records.
- `canvases[].purpose == "survey"`: configured metric survey.
- Date ranges: use canvas/node `updatedAt` or canvas events in `history`, not the run's `createdAt`.
- Summaries: include text plus metric/survey values; preserve recording/log identity and timestamp; omit empty boundaries and irrelevant test noise.
