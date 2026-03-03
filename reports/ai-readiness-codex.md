# AI Contribution Readiness Audit

## Target
- Repo: `/Users/chall/gt/cdk2pulumi/crew/fiddler`
- Language/stack: TypeScript, Node.js/npm, Projen, Jest, Bun (packaging), GitHub Actions
- Audit date: 2026-03-03

---

## Part 1: Diagnostic Summary

### What exists

| Artifact | Status | Notes |
|---|---|---|
| AGENTS.md / instruction contract | Partial | Exists at `AGENTS.md`, but has stale references (`spec.md`, `spec-cdk-analyze.md`) and lacks explicit forbidden actions/escalation contract. |
| Makefile / justfile / command surface | Partial | No `Makefile`/`justfile`; command surface is via `package.json` and `.projen/tasks.json`. This is workable but fragmented across docs. |
| CI workflow | Good | `.github/workflows/build.yml` runs `npx projen build` and has anti-drift self-mutation detection. |
| PR template | Weak | `.github/pull_request_template.md` contains only `Fixes #`; no validation/risk/evidence sections. |
| CONTRIBUTING.md | Missing | No contributor workflow guide. |
| Architecture / module docs | Partial | High-level context exists in `AGENTS.md` and specs, but no dedicated module-boundary map for quick file targeting. |
| Test commands (fast + full) | Partial | Fast/full commands exist (`test:unit`, `test:integration`, `test`), but command guidance is inconsistent and default `test` task is mutation-prone. |

### Explore-phase evidence (repo reality)

- Repo map confirmed: `src/core`, `src/cli`, `test/`, `specs/`, `docs/`, `.github/workflows/`.
- Artifact check confirmed: `AGENTS.md`, `README.md`, `INSTRUCTIONS.md`, CI workflows, PR template present; `CONTRIBUTING.md` absent.
- Command reality executed:
  - `npx projen test:unit` failed in clean checkout due missing dependency context (`jest-junit` custom reporter unresolved).
  - `npm run package:linux:arm` failed (`Missing script`) while docs/specs still reference it.
  - `npm run` confirmed actual script names are `package:linux-arm64`, `package:darwin-arm64`, etc.

### Concrete mismatches / surprises (>=3)

1. `AGENTS.md` tells agents to check `spec.md` and `spec-cdk-analyze.md`, but those files do not exist; current files are `specs/conversion.md` and `specs/analysis.md`.
2. `docs/intrinsics.md` points to non-existent paths (`src/ir/*`, `tests/*`), while code/tests live under `src/core/*` and `test/*`.
3. `specs/conversion.md` references non-existent package scripts (`npm run package:linux:arm`, `npm run package:macos:arm`), verified by command failure.
4. `.projen/tasks.json` defines `test` as `jest --updateSnapshot` plus `eslint --fix`; this means default test flow mutates files, which is high-friction for AI agents and reviewers.
5. Instruction canon is split/conflicting: `INSTRUCTIONS.md` says always use `npx projen ...`, while README/docs primarily teach `npm run ...` wrappers.

### What this repo does well

- Strong CI anti-drift behavior: build workflow detects and surfaces mutation patches.
- Clear technical decomposition in code (`src/core` vs `src/cli`) with extensive tests in `test/`.
- Projen-managed setup provides a single source of truth for generated/project config.

### Top 3 gaps

1. Instruction contract drift: key guidance points at stale files/paths and misses critical safety/escalation rules, causing AI agents to start from invalid context.
2. Verification loop ambiguity and mutation risk: default verification paths are inconsistent and can auto-mutate snapshots/lint output, increasing noisy diffs and review churn.
3. Contribution ergonomics are under-specified: no CONTRIBUTING guide and a minimal PR template fail to require evidence/risk reporting for AI-generated changes.

### Calibration note

This repo behaves like an infrastructure/tooling project (Pulumi conversion pipeline). The highest-impact remediations are explicit regeneration/verification contracts, fast non-mutating test paths, and clear generated-vs-handwritten boundaries.

---

## Part 2: Implementation Packet

### Change 1: `AGENTS.md`
**Action:** edit
**Why:** Addresses gap #1 by creating a precise, current instruction contract with command canon, safety rails, and escalation triggers.

~~~markdown
# Agent Guide: Pulumi CDK Conversion

This file is the repository-specific instruction contract for AI agents and contributors.

## What This Repo Is

`cdk2pulumi` is a standalone toolchain for converting AWS CDK cloud assemblies to Pulumi YAML and for analyzing assemblies to support migration planning.

Long-term direction: keep this repo reintegration-friendly with `pulumi-cdk` (avoid changes that permanently diverge architecture or API shape).

## Start Here

- `INSTRUCTIONS.md` — Projen management rules (generated files, task model)
- `README.md` — user-facing CLI usage and developer workflow
- `specs/conversion.md` — conversion implementation plan
- `specs/analysis.md` — analyzer implementation plan
- `src/core/` — reusable conversion/analyzer logic
- `src/cli/cli-runner.ts` — CLI entrypoint
- `docs/testing.md` — test strategy and placement
- `.projenrc.ts` — source of truth for generated project/workflow config

## Command Canon

Run from repo root.

- Install deps: `npm ci`
- Compile: `npx projen compile`
- Lint (existing task, auto-fix behavior): `npx projen eslint`
- Fast unit tests: `npx projen test:unit`
- Integration/synth tests: `npx projen test:integration`
- Full build (compile + test + package): `npx projen build`
- Synthesize generated files after `.projenrc.ts` edits: `npx projen`

CLI local run:

- `bun src/cli/cli-runner.ts --assembly <path/to/cdk.out>`

## Key Invariants

- Keep `src/core` runtime-agnostic and reusable by CLI/runtime entrypoints.
- Preserve IR contract compatibility unless change is intentional and covered by tests/spec updates.
- Do not manually edit Projen-generated files (`package.json`, workflow YAMLs, `jest.config.json`, etc.); edit `.projenrc.ts` and run `npx projen`.
- Keep `specs/conversion.md` and `specs/analysis.md` checklists up to date as work lands.

## Forbidden Actions

- Do not run destructive git operations (`git reset --hard`, force-push, branch deletion) without explicit approval.
- Do not manually edit generated files with the Projen header.
- Do not claim tests passed unless you ran them.
- Do not mix unrelated refactors into behavior changes.

## Escalate Immediately If

- Instructions conflict between docs/specs and code reality.
- A change alters output schema/IR shape or stack/resource naming semantics.
- A change affects cross-stack reference handling, custom-resource emulation, or asset handling behavior.
- Tests fail after two focused debugging attempts.

## If You Change...

- `src/core/**` or `src/cli/**`:
  - Run: `npx projen compile && npx projen test:unit`
- CLI behavior or serializer output:
  - Also run: `npx projen test:integration`
- `.projenrc.ts`:
  - Run: `npx projen`, then re-run relevant tests
- Specs/docs behavior expectations:
  - Update the relevant spec/doc in same PR

## Quick Ownership Map

- Conversion pipeline and IR: `src/core/`
- CLI command parsing/output: `src/cli/`
- Tests: `test/` grouped by feature area (`cli`, `core`, `analysis`, `synth`, `ir`)
~~~

**Verify:** `rg -n "spec\.md|spec-cdk-analyze\.md" AGENTS.md || true`
**Expected:** no matches; AGENTS references only current spec paths.

---

### Change 2: `CONTRIBUTING.md`
**Action:** create
**Why:** Addresses gap #3 by defining contributor workflow and evidence expectations for AI-assisted changes.

~~~markdown
# Contributing

Thanks for contributing to `cdk2pulumi`.

## Prerequisites

- Node.js + npm
- Bun (required for packaging tasks)

Install dependencies:

```bash
npm ci
```

## Repository Rules

- This project is Projen-managed.
- Do not manually edit files with the Projen generated header.
- For config/workflow/script changes, edit `.projenrc.ts` and run:

```bash
npx projen
```

## Development Workflow

1. Read `AGENTS.md`, `README.md`, and relevant spec (`specs/conversion.md` or `specs/analysis.md`).
2. Make the smallest scoped change.
3. Add/adjust tests near your change.
4. Run validation commands (below).
5. Update docs/spec checkboxes when behavior or plan state changes.

## Validation Commands

Fast loop (most PRs):

```bash
npx projen compile
npx projen test:unit
```

When CLI conversion/analyzer behavior changes:

```bash
npx projen test:integration
```

Before merge (recommended):

```bash
npx projen build
```

## AI-Assisted Contributions

AI-generated PRs should include:

- Problem statement and scoped change summary
- Exact commands run for validation
- Risks/blast radius
- Any follow-up intentionally deferred

AI-generated PRs should avoid:

- Unrelated refactors
- Manual edits to Projen-generated files
- Claims about tests/commands that were not executed

## Testing Placement

- `test/cli/` for CLI behavior and serialization
- `test/core/` and `test/ir/` for conversion/intrinsics core logic
- `test/analysis/` for analyzer behavior
- `test/synth/` for end-to-end synth/CLI smoke checks

## Documentation Expectations

Update docs/specs when you change:

- Command names or workflow
- IR/serializer behavior
- Analyzer report shape
- Packaging behavior
~~~

**Verify:** `test -f CONTRIBUTING.md && rg -n "Projen-managed|AI-Assisted Contributions|Validation Commands" CONTRIBUTING.md`
**Expected:** file exists and includes those three sections.

---

### Change 3: `.github/pull_request_template.md`
**Action:** edit
**Why:** Addresses gap #3 by enforcing evidence/risk fields for higher-quality AI contributions.

~~~markdown
## Summary

- What changed?
- Why was this needed?
- Link issue/spec/task.

Fixes #

## Validation

- [ ] `npx projen compile`
- [ ] `npx projen test:unit`
- [ ] `npx projen test:integration` (required for CLI conversion/analyzer behavior changes)
- [ ] `npx projen build` (recommended before merge)

Paste relevant output snippets (or explain why not run):

```text
<command output>
```

## Risk & Blast Radius

- Primary risk:
- Affected modules/files:
- User-visible behavior changes:

## Rollback Plan

- How to revert quickly if regression is found.

## Checklist

- [ ] No manual edits to Projen-generated files (or `.projenrc.ts` updated + `npx projen` run)
- [ ] Specs/docs updated where behavior or workflow changed
- [ ] Tests added or updated for behavior changes
~~~

**Verify:** `rg -n "Validation|Risk & Blast Radius|Rollback Plan|Checklist" .github/pull_request_template.md`
**Expected:** all four required sections present.

---

### Change 4: `docs/architecture.md`
**Action:** create
**Why:** Addresses gap #1 and #2 by giving agents a file-targeting map and module boundary rules.

```markdown
# Architecture

## Module Map

- `src/cli/`
  - CLI argument parsing, command routing (`convert`, `analyze`, `ids`), output writing.
- `src/core/assembly/`
  - Cloud Assembly manifest loading and stage/stack traversal.
- `src/core/resolvers/`
  - Intrinsic resolution and stack conversion internals.
- `src/core/analysis/`
  - Analyzer report construction (constructs, resources, assets, environments).
- `src/core/`
  - Shared IR types, metadata helpers, graph/substitution/stack utilities.
- `schemas/`
  - Metadata and identifier datasets used by conversion/id lookup.
- `test/`
  - Unit/integration/synth tests grouped by feature area.

## Boundaries

- Keep conversion/analyzer logic in `src/core`; keep `src/cli` as orchestration and I/O.
- Do not make `src/core` depend on CLI-only concerns.
- Preserve deterministic resource naming and cross-stack reference behavior.
- Treat schema/metadata files in `schemas/` as data inputs; document regeneration workflows when they change.

## Common Change Patterns

CLI argument or output behavior change:

- Update `src/cli/cli-runner.ts`
- Add/adjust tests in `test/cli/`
- If user-visible, update `README.md` and `docs/testing.md`

Intrinsic behavior change:

- Update resolver in `src/core/resolvers/`
- Add tests in `test/ir/` and serialization coverage in `test/cli/`
- Update `docs/intrinsics.md`

Analyzer report change:

- Update `src/core/analysis/`
- Add tests in `test/analysis/`
- Update `specs/analysis.md` checklist/state

Project/workflow config change:

- Edit `.projenrc.ts`
- Run `npx projen`
- Commit generated changes
```

**Verify:** `test -f docs/architecture.md && rg -n "Module Map|Boundaries|Common Change Patterns" docs/architecture.md`
**Expected:** file exists with all three sections.

---

### Change 5: `.projenrc.ts`
**Action:** edit
**Why:** Addresses gap #2 by introducing explicit non-mutating verification tasks for AI workflows.

```diff
*** Begin Patch
*** Update File: .projenrc.ts
@@
 project.addTask('test:integration', {
   exec: 'npx jest --collectCoverage=false --testPathPatterns="(\\.integration|\\.synth)\\.test\\.ts$"',
   description: 'Runs integration and synth tests only.',
 });
+
+project.addTask('lint:check', {
+  exec: 'ESLINT_USE_FLAT_CONFIG=false eslint --ext .ts,.tsx --no-error-on-unmatched-pattern src test build-tools projenrc .projenrc.ts',
+  description: 'Runs eslint without applying fixes.',
+});
+
+project.addTask('test:unit:ci', {
+  exec: 'npx jest --ci --collectCoverage=false --testPathIgnorePatterns="\\.integration\\.test\\.ts$|\\.synth\\.test\\.ts$"',
+  description: 'Runs non-mutating unit tests for CI/PR validation.',
+});
+
+project.addTask('verify:ai', {
+  description: 'Runs non-mutating checks for AI-assisted contributions.',
+  steps: [
+    { spawn: 'compile' },
+    { spawn: 'lint:check' },
+    { spawn: 'test:unit:ci' },
+  ],
+});
*** End Patch
```

**Verify:** `npx projen && jq -r '.scripts["verify:ai"], .scripts["lint:check"], .scripts["test:unit:ci"]' package.json`
**Expected:** all three scripts are present and map to the new tasks.

---

### Change 6: `docs/intrinsics.md`
**Action:** edit
**Why:** Addresses gap #1 by fixing stale file/test path references that currently point agents to non-existent locations.

```diff
*** Begin Patch
*** Update File: docs/intrinsics.md
@@
-1. **Stack conversion** – `convertStackToIr` wires together the intrinsic resolver, the intrinsic value adapter, and the resource emitter (`src/ir/stack-converter.ts`). Every CloudFormation template passes through this stage before anything Pulumi-specific happens.
-2. **Intrinsic resolution** – `IrIntrinsicResolver` recursively walks every property/output/parameter, folds supported CloudFormation intrinsics, and produces `PropertyValue` nodes that retain semantic information such as resource references, stack outputs, concatenations, and dynamic references (`src/ir/intrinsic-resolver.ts`).
-3. **Intermediate representation** – Resolved values become part of `ResourceIR`, `OutputIR`, and `ParameterIR`. These interfaces describe the template after intrinsics are handled but before any normalization or serialization occurs (`src/ir.ts`).
+1. **Stack conversion** – `convertStackToIr` wires together the intrinsic resolver, the intrinsic value adapter, and the resource emitter (`src/core/resolvers/stack-converter.ts`). Every CloudFormation template passes through this stage before anything Pulumi-specific happens.
+2. **Intrinsic resolution** – `IrIntrinsicResolver` recursively walks every property/output/parameter, folds supported CloudFormation intrinsics, and produces `PropertyValue` nodes that retain semantic information such as resource references, stack outputs, concatenations, and dynamic references (`src/core/resolvers/intrinsic-resolver.ts`).
+3. **Intermediate representation** – Resolved values become part of `ResourceIR`, `OutputIR`, and `ParameterIR`. These interfaces describe the template after intrinsics are handled but before any normalization or serialization occurs (`src/core/ir.ts`).
@@
-- Filters out `AWS::NoValue`, recurses through objects/arrays, and parses dynamic reference strings (SSM/Secrets Manager) into structured `DynamicReferenceValue`s (`src/ir/dynamic-references.ts`).
-- Handles `Ref`/`Fn::GetAtt` via an `IntrinsicValueAdapter`. The default `IrIntrinsicValueAdapter` converts attribute usage into `ResourceAttributeReference` objects so later phases know which Pulumi resource/property to reference (`src/ir/intrinsic-value-adapter.ts`). Metadata (`cfRef` definitions in `metadata.ts`) controls how `Ref` maps to Pulumi properties, including concatenations when CloudFormation exposes composite identifiers.
+- Filters out `AWS::NoValue`, recurses through objects/arrays, and parses dynamic reference strings (SSM/Secrets Manager) into structured `DynamicReferenceValue`s (`src/core/resolvers/dynamic-references.ts`).
+- Handles `Ref`/`Fn::GetAtt` via an `IntrinsicValueAdapter`. The default `IrIntrinsicValueAdapter` converts attribute usage into `ResourceAttributeReference` objects so later phases know which Pulumi resource/property to reference (`src/core/resolvers/intrinsic-value-adapter.ts`). Metadata (`src/core/metadata.ts`) controls how `Ref` maps to Pulumi properties, including concatenations when CloudFormation exposes composite identifiers.
@@
-1. **Decide the IR shape** – Can the intrinsic be expressed with the existing `PropertyValue` union (string/array/map/reference/concat/dynamic)? If not, extend `PropertyValue` in `src/ir.ts` with a new discriminated union member.
-2. **Teach the resolver** – Add an `isYourIntrinsic` guard and `resolveYourIntrinsic` helper in `src/ir/intrinsic-resolver.ts`. The helper should return the chosen `PropertyValue` representation and reuse `resolveValue` for nested expressions.
+1. **Decide the IR shape** – Can the intrinsic be expressed with the existing `PropertyValue` union (string/array/map/reference/concat/dynamic)? If not, extend `PropertyValue` in `src/core/ir.ts` with a new discriminated union member.
+2. **Teach the resolver** – Add an `isYourIntrinsic` guard and `resolveYourIntrinsic` helper in `src/core/resolvers/intrinsic-resolver.ts`. The helper should return the chosen `PropertyValue` representation and reuse `resolveValue` for nested expressions.
@@
-4. **Test** – Add resolver-level tests under `tests/ir/intrinsic-resolver.test.ts` to pin the IR shape and end-to-end YAML tests under `tests/cli/ir-to-yaml.test.ts` to verify serialized output.
+4. **Test** – Add resolver-level tests under `test/ir/intrinsic-resolver.test.ts` to pin the IR shape and end-to-end YAML tests under `test/cli/ir-to-yaml.test.ts` to verify serialized output.
*** End Patch
```

**Verify:** `rg -n "src/ir/|tests/" docs/intrinsics.md || true`
**Expected:** no matches.

---

### Change 7: `specs/conversion.md`
**Action:** edit
**Why:** Addresses gap #1 by correcting stale package command names and test path references.

```diff
*** Begin Patch
*** Update File: specs/conversion.md
@@
-- Install [Bun](https://bun.sh) locally and run `npm run package:linux:arm` or `npm run package:macos:arm` to emit standalone binaries at `dist/bin/linux-arm64/cdk2pulumi` and `dist/bin/macos-arm64/cdk2pulumi` respectively (the script enables `--minify` and `--sourcemap` by default).
+- Install [Bun](https://bun.sh) locally and run `npm run package:linux-arm64` or `npm run package:darwin-arm64` to emit standalone binaries at `dist/bin/linux-arm64/pulumi-tool-cdk2pulumi` and `dist/bin/darwin-arm64/pulumi-tool-cdk2pulumi` respectively (the script enables `--minify` and `--sourcemap` by default).
@@
-- [ ] Update the stage integration test to run without `--stacks` once imports are supported (i.e., convert the entire Dev stage). _(Currently blocked by the unresolved `Fn::GetAZs` intrinsic; see `tests/cli/stage.integration.test.ts` for the regression test that captures the failure case.)_
+- [ ] Update the stage integration test to run without `--stacks` once imports are supported (i.e., convert the entire Dev stage). _(Currently blocked by the unresolved `Fn::GetAZs` intrinsic; see `test/cli/stage.integration.test.ts` for the regression test that captures the failure case.)_
@@
-- [ ] **Remove legacy intrinsic implementation** – After the runtime successfully emits resources from IR, delete `src/converters/intrinsics.ts`, `processIntrinsics`, and other now-redundant evaluators. Port the relevant tests to exercise the shared IR resolver (e.g., reuse `tests/ir/intrinsic-resolver.test.ts` plus a Pulumi integration test that provisions a representative stack via the runtime).
+- [ ] **Remove legacy intrinsic implementation** – After the runtime successfully emits resources from IR, delete `src/converters/intrinsics.ts`, `processIntrinsics`, and other now-redundant evaluators. Port the relevant tests to exercise the shared IR resolver (e.g., reuse `test/ir/intrinsic-resolver.test.ts` plus a Pulumi integration test that provisions a representative stack via the runtime).
*** End Patch
```

**Verify:** `rg -n "package:linux:arm|package:macos:arm|tests/cli|tests/ir" specs/conversion.md || true`
**Expected:** no matches.

---

### Change 8: `specs/analysis.md`
**Action:** edit
**Why:** Addresses gap #1 by removing stale spec-file naming that conflicts with current repository layout.

```diff
*** Begin Patch
*** Update File: specs/analysis.md
@@
-- [ ] Update `spec.md` + `AGENTS.md` to reference the analyzer work and cross-link with this spec.
+- [ ] Update `specs/conversion.md` + `AGENTS.md` to reference the analyzer work and cross-link with this spec.
*** End Patch
```

**Verify:** `rg -n "spec\.md" specs/analysis.md || true`
**Expected:** no matches.

---

## Notes on Verification Confidence

- Commands that need local dependencies (`npm ci`) are marked as expected post-setup; they were not fully re-verified in this clean checkout context.
- Audit findings and mismatches above are grounded in direct file/path inspection and command outputs captured during this audit.
