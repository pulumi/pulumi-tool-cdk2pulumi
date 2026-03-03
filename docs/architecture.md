# Architecture

This document is a quick targeting map for contributors and AI agents.

## Module Map

- `src/cli/`
  - CLI argument parsing and command routing (`convert`, `analyze`, `ids`)
  - Output writing and report emission
- `src/core/assembly/`
  - Cloud Assembly manifest loading
  - Stage/stack traversal and nested assembly loading
- `src/core/resolvers/`
  - CloudFormation intrinsic resolution
  - Stack conversion internals
- `src/core/analysis/`
  - Analyzer report data model and orchestration
- `src/core/`
  - Shared IR types, metadata helpers, graph/stack utilities
- `schemas/`
  - Metadata/identifier datasets consumed by conversion and id lookup
- `test/`
  - Unit, integration, and synth coverage grouped by feature area

## Boundaries

- Keep reusable conversion logic in `src/core`; keep `src/cli` focused on orchestration/I/O.
- Avoid coupling `src/core` to CLI-only concerns.
- Preserve deterministic resource naming and cross-stack reference behavior.
- Treat `schemas/` files as generated or extracted data, and document regeneration steps when they change.

## Common Change Patterns

CLI behavior change:

- Update `src/cli/cli-runner.ts` and related serializer code.
- Add/update tests in `test/cli/`.
- Update user-facing docs (`README.md`, relevant specs) when behavior changes.

Intrinsic resolver change:

- Update `src/core/resolvers/`.
- Add tests in `test/ir/` and serializer coverage in `test/cli/`.
- Update `docs/intrinsics.md` if behavior expectations changed.

Analyzer report change:

- Update `src/core/analysis/`.
- Add tests in `test/analysis/`.
- Update `specs/analysis.md` checklist/state.

Project/workflow config change:

- Edit `.projenrc.ts`.
- Run `npx projen`.
- Commit generated file updates with the config change.
