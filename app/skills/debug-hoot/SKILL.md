---
name: debug-hoot
description: Convert and troubleshoot CTRE Phoenix .hoot signal logs with owlet, then analyze the resulting WPILOG. Use when a user asks to inspect, debug, or analyze a .hoot file.
license: MIT
---

# Debug CTRE hoot logs

Phoenix 6 writes device signals in CTRE's binary `.hoot` format. Convert the requested log with the preinstalled `owlet` CLI, then use the `analyze-wpilog` skill on the result.

## Convert the log

Choose a writable output path that does not overwrite an existing file. Quote both paths because attachment names can contain spaces.

```sh
owlet "input.hoot" "output.wpilog" --format=wpilog
```

Confirm that the command succeeded and produced a non-empty `.wpilog` before analyzing it. Keep the original `.hoot` file.

## Narrow large logs when useful

- `--scan` lists available signals. Pass a comma-separated set of the reported IDs to `--signals=` when the question only needs a subset.
- `--enable-only=N` retains the interval from `N` seconds before each enable through `N` seconds after disable. `N` must be at least 1.

Apply these options to the conversion command, after the two file paths. Do not narrow the log when doing so could discard evidence relevant to the request.

## Troubleshoot conversion failures

- Run the same command with `--compliancy` to compare the installed owlet version with the log's format.
- Run it with `--check-pro` to determine whether the log contains Phoenix Pro devices. Use `--full-scan` as well if the normal scan is inconclusive.
- Use `--unlicensed` only after `--check-pro` confirms there are no Pro devices; otherwise it can decode the log incorrectly.

Report the exact `owlet` error if conversion still fails. Do not fabricate analysis from an incomplete or missing WPILOG.
