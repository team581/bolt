---
name: debug-hoot
description: Convert CTRE Phoenix hoot (.hoot) signal logs to WPILOG using the owlet CLI so they can be analyzed. Use when a user asks to debug, inspect, or analyze a .hoot file.
license: MIT
---

# Debugging hoot files

`hoot` is CTRE Phoenix 6's binary signal log format. It is not directly parseable by our tooling; convert it to WPILOG with CTRE's `owlet` CLI, then analyze the result with the `analyze-wpilog` skill.

## Installing owlet

CTRE publishes a machine-readable index of their CLI tools. This resolves the latest `owlet` build for the current season and installs it (verified working on the Linux x86-64 sandbox):

```sh
URL=$(curl -s https://redist.ctr-electronics.com/index.json | jq -r '
  .LatestChannel as $ch
  | ([.ChannelCompliancy[] | select(.Name == $ch) | .Compliancy] | .[0]) as $c
  | [.Tools[] | select(.Name == "owlet") | .Items[] | select(.Compliancy == $c)]
  | sort_by(.Version | split(".") | map(tonumber))
  | last | .Urls["linuxx86-64"]')
curl -sL "$URL" -o /usr/local/bin/owlet && chmod +x /usr/local/bin/owlet
```

## Converting

```sh
owlet log.hoot log.wpilog --format=wpilog
```

Useful flags:

- `--scan` lists available signals; pass their IDs to `--signals=` to export only what you need
- `--enable-only=N` trims output to N seconds around robot enable/disable periods
- `--unlicensed` skips Phoenix Pro license checks when the log has no Pro devices

After conversion, analyze the `.wpilog` output with the `analyze-wpilog` skill.
