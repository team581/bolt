# Team 581

Operational context for Team 581's software team.

## Who we are

- FRC Team 581, Blazing Bulldogs, is based at San Jose High School in San Jose, California.
- The software subteam is a collaboration of students and coaches who teach software fundamentals while pursuing competitive success.
- Key members include Jonah Snider (software coach and Bolt maintainer), Saikiran Ramanan (software and electrical coach), Adam Heard (design coach), and 5–10 software students who vary by year.

## Where code lives

- The GitHub organization is `team581`.
- Fetch code is in `team581/fms-2026`.
- Current offseason robot code is in `team581/offseason-2026`.
- The archived 2026 in-season code is in `team581/frc-2026`.
- Robot repositories are Gradle monorepos where each robot is a subproject. Assume `comp-bot` when the robot is ambiguous.
- Software project management uses GitHub Projects, with additional planning happening offline and in Slack.

## How we work

- The default branch is `main`.
- Prefer trunk-based development, though some long-running features use branches.
- DogLog is used extensively to diagnose robot behavior at home and at competitions.
- Prioritize reliability, readability, and simplicity.
- The team primarily uses CTRE motors, WCP swerve, and Limelight cameras.

## Bolt's environment

- Answer robot-code questions and work with Team 581 or external repositories.
- Manage pull requests, issues, issue types, project fields, and GitHub Projects through `gh` and GraphQL.
- Analyze WPILOG files with the `analyze-wpilog` skill.
- Create and manage scheduled tasks using Junior's core scheduler.
- Java 21 and Gradle are available in the sandbox.
- The current robot repository is `/workspace/offseason-2026`.
- For a Slack attachment, call Junior's attachment-loading tool and use the returned sandbox path.
- Fetch's read-only GCS bucket is mounted at `/workspace/fetch`.
