# Agent Guide: Pulumi CDK Conversion

This is the repository-specific operating contract for contributors and AI agents.

Read `INSTRUCTIONS.md` first for Projen rules.

## Context

We are working in `pulumi-cdk-convert`, a repository extracted from the main `pulumi-cdk` project. The long-term goal is reintegration, so avoid changes that permanently bifurcate architecture or APIs.

Major areas:
1. Conversion core (`src/core`) for assembly parsing, intrinsics, and IR conversion.
2. CLI (`src/cli/cli-runner.ts`) for conversion/analyzer commands.
3. Analyzer (`src/core/analysis`) for migration planning reports.

## Start Here

- `README.md` for user-facing behavior and quickstart.
- `specs/conversion.md` for conversion backlog and status.
- `specs/analysis.md` for analyzer backlog and status.
- `docs/testing.md` for test strategy.
- `docs/intrinsics.md` for intrinsic pipeline details.
- `docs/architecture.md` for module boundaries and change targeting.

## Command Canon

Run all project tasks through Projen:

- Install deps: `npm ci`
- Compile: `npx projen compile`
- Unit tests (fast): `npx projen test:unit`
- Unit tests (CI/non-mutating): `npx projen test:unit:ci`
- Integration/synth tests: `npx projen test:integration`
- Runtime tests (local-only for now; not in CI): `npx projen test:runtime`
- Full test suite: `npx projen test`
- Lint (non-mutating): `npx projen lint:check`
- AI verification bundle: `npx projen verify:ai`
- Full build: `npx projen build`
- Regenerate project files after `.projenrc.ts` changes: `npx projen`
- Regenerate primary identifiers from metadata: `npx projen extract-identifiers`

CLI local execution:

- `bun src/cli/cli-runner.ts --assembly <path-to-cdk.out>`

Bun packaging wrappers:

- `npm run package:linux-arm64`
- `npm run package:darwin-arm64`

## Workflow Requirements

1. Before implementation, check `specs/conversion.md` and `specs/analysis.md`.
2. Keep spec checkboxes in sync with completed work.
3. If you change `.projenrc.ts`, run `npx projen` and commit generated outputs.
4. If you change behavior in `src/`, run at least `npx projen test:unit`; run `npx projen test:integration` for CLI/serialization/analyzer behavior changes.

## Safety Rails

Forbidden without explicit approval:

- Destructive git operations (`git reset --hard`, force-push, deleting branches/history).
- Manual edits to Projen-generated files.
- Declaring tests passed when not executed.

Escalate before proceeding when:

- Instructions/docs disagree with code reality.
- A change alters IR shape, stack/resource naming, or cross-stack reference semantics.
- Behavior touches custom resources, stage handling, or asset handling semantics.

## If You Change...

- `src/core/**` or `src/cli/**`: run `npx projen compile` and `npx projen test:unit`.
- CLI output/serialization/analyzer behavior: also run `npx projen test:integration`.
- Runtime validation coverage (`test/runtime/**`) is local-only for now; do not claim CI coverage for it unless a dedicated CI path is added.
- `.projenrc.ts`: run `npx projen` then `npx projen build`.
- `schemas/aws-native-metadata.json` or identifier datasets: run `npx projen extract-identifiers`, then `npx projen build`.
- Specs/docs: update related checklists and command/path references in the same PR.

## High-Level TODOs

### Conversion CLI (`specs/conversion.md`)

- [ ] Provide minimal CLI usage docs in README.
- [ ] Finish import flattening serializer test coverage and stage-wide import flow.
- [ ] Emit top-level Pulumi outputs from stack outputs.
- [ ] Unify runtime conversion on shared IR path.

### Analyzer (`specs/analysis.md`)

- [ ] Resource inventory asset correlation.
- [ ] Custom resource service token + Lambda handler tracing.
- [ ] Asset usage reporting (file/docker asset mapping).
- [ ] Unit + snapshot + CLI integration test coverage.

## Notes

- `CLAUDE.md` should be a symlink to this file (`AGENTS.md`).
- Keep `src/core` runtime-agnostic; avoid coupling it to CLI-only concerns.
