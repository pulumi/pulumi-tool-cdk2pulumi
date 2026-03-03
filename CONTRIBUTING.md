# Contributing

Thanks for contributing to `cdk2pulumi`.

## Prerequisites

- Node.js + npm
- Bun (needed for packaging tasks)

Install dependencies:

```bash
npm ci
```

## Projen-Managed Repository

- This repo is managed by Projen.
- Do not manually edit generated files (`package.json`, workflow YAML, tsconfig, etc.).
- Update `.projenrc.ts`, then run:

```bash
npx projen
```

## Development Workflow

1. Read `AGENTS.md`, `README.md`, and relevant spec (`specs/conversion.md` or `specs/analysis.md`).
2. Make the smallest scoped change that solves the issue.
3. Add or update tests near the changed behavior.
4. Run validation commands.
5. Update specs/docs when behavior or workflow changes.

## Validation Commands

Fast loop:

```bash
npx projen compile
npx projen test:unit
```

Non-mutating AI/CI loop:

```bash
npx projen verify:ai
```

When CLI conversion/analyzer behavior changes:

```bash
npx projen test:integration
```

Before merge (recommended):

```bash
npx projen build
```

## Schema / Metadata Regeneration

When you change identifier datasets or metadata inputs in `schemas/`:

```bash
npx projen extract-identifiers
npx projen build
```

Commit regenerated outputs with the source change in the same PR.

## AI-Assisted Contributions

Include in the PR:

- Problem statement and scoped summary.
- Exact commands run for validation.
- Risks and blast radius.
- Explicit follow-ups intentionally deferred.

Avoid:

- Unrelated refactors in the same PR.
- Manual edits to generated files.
- Claiming tests passed without running them.

## Test Placement

- `test/cli/` for CLI behavior and serialization.
- `test/core/` and `test/ir/` for conversion/intrinsic core logic.
- `test/analysis/` for analyzer behavior.
- `test/synth/` for synth and smoke coverage.
