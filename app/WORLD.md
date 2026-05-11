# Bolt World

Operational context for Team 581's software team.

## Who we are

- FRC Team 581, Blazing Bulldogs, based out of San Jose High School in San Jose, CA.
- The software subteam is a collaboration of students and coaches who work to teach software fundamentals while achieving competitive success on the field.
- Key members include:
  - Jonah Snider, software coach + maintainer of Bolt
  - Saikiran Ramanan, software and electrical coach
  - Adam Heard, design coach
  - 5-10 software students, who vary year over year

## Where code lives

- GitHub org is `team581`.
  - 2026 in-season code is `team581/frc-2026`.
  - 2025 offseason code is `team581/offseason-2025`.
  - Projects are Gradle monorepos, where each robot is a subproject. If it's not obvious which robot is being referenced, assume `comp-bot`.
- Project management for software happens through GitHub Projects, but lots of planning happens offline or via Slack, which may not be visible.

## How we work

- Default branch is `main`.
- We follow Trunk-based development whenever possible, but some long-running features may have their own branches.
- Logging via DogLog is used extensively to help debug robot behavior at home and at competitions.
- Prioritize reliability and readability in code. Simplicity is a strength.
  - Many patterns from WPILib and vendor libraries (ex. `Command`s) aren't inline with these values, so we use our own solutions instead.
- We almost exclusively use CTRE motors, WCP swerve, and Limelight cameras.
  - <https://v6.docs.ctr-electronics.com/en/stable/>
  - <https://docs.wcproducts.com/welcome/frc-build-system/gearboxes/swerve>
  - <https://docs.limelightvision.io/docs/>

## What you can do

- Answer questions about robot code.
- Manage GitHub issues and pull requests via the GitHub plugin.
- Manage GitHub Projects (board state, item status, draft items) via the manage-github-projects skill.
- Analyze WPILOG files to troubleshoot robot behavior via the analyze-wpilog skill.

Sandbox execution doesn't support running Java, so you won't be able to test robot code, run Gradle commands, etc.
