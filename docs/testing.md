# Testing Guide

This repo uses Jest for unit tests and end-to-end smoke tests (synth + CLI).
The default `npm test` runs the full suite with coverage enabled.

## Quick Start

```bash
# Fast feedback (unit tests only)
npm run test:unit

# Integration smoke tests (synth + CLI)
npm run test:integration

# Pulumi runtime validation (local-only for now; requires Pulumi CLI + AWS credentials)
npm run test:runtime

# Full suite with coverage
npm test
```

## Test Types

- **Unit tests**: Focused logic tests that run quickly. These live across `test/` and cover serializer, IR, CLI parsing, and analysis helpers.
- **Smoke/integration tests**: End-to-end pipeline checks that synthesize a CDK app and run the CLI.
  These use the `*.synth.test.ts` naming convention and live under `test/synth/`.
  Prefer `runCliWithOptions` + a report summary snapshot over direct IR/YAML snapshots.
- **Runtime validation tests**: Targeted Pulumi CLI previews against generated `Pulumi.yaml`.
  These live under `test/runtime/` and are executed only by `test:runtime` because they require
  a real Pulumi installation plus AWS credentials for provider-backed invokes.
  They are local-only for now and are not part of the default CI suite yet.
  Ensure the Pulumi CLI is available and AWS credentials are present in the environment before
  invoking `npx projen test:runtime`.

## Patterns and Conventions

- Prefer small, explicit assertions over large snapshots.
- Smoke tests should validate the pipeline, not detailed correctness.
  If a bug is fixed, add a unit test for the specific logic.
- Avoid full snapshots of IR/YAML/report files.
  If using snapshots, snapshot a stable summary (e.g., report summary with sorted type tokens).
- Use static fixtures only for malformed/edge-case assemblies or asset workflows that need real files.

## Where Tests Live

- `test/cli/`: CLI behavior, argument parsing, YAML serialization, report generation.
- `test/core/` and `test/ir/`: conversion core, intrinsics, stack conversion.
- `test/analysis/`: analyzer logic and reporting.
- `test/synth/`: smoke tests that synthesize a CDK app and run the CLI pipeline.

## Tips for Adding Tests

- If you are testing CDK behavior or the end-to-end pipeline, add a smoke test.
- If you are testing pure logic or a bug fix, add a unit test.
- If you need to prove Pulumi itself accepts and evaluates generated YAML, add a runtime test.
- Keep smoke tests focused on a single end-to-end behavior and avoid heavy mocking.
- Use `summarizeConversionReport` in `test/synth/helpers.ts` to snapshot stable summaries.

## Coverage

- `npm test` writes coverage reports to `coverage/`.
- Use `npm run test:unit` for a fast loop without coverage overhead.
