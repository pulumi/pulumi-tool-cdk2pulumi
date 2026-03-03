# AI Contribution Readiness Audit

## Target
- Repo: `cdk2pulumi` (pulumi-cdk-convert)
- Language/stack: TypeScript, Node.js, Projen, Jest, Bun (packaging)
- Audit date: 2026-03-03

---

## Part 1: Diagnostic Summary

### What exists
| Artifact | Status | Notes |
|---|---|---|
| AGENTS.md / instruction contract | Partial | Context/onboarding doc at `AGENTS.md`. Lists test commands and project structure but lacks command canon, forbidden actions, escalation triggers, and "if you change..." rules. |
| Makefile / justfile / command surface | N/A (projen) | `.projen/tasks.json` defines all tasks. `npx projen <task>` is the canonical interface. No Makefile/justfile needed. |
| CI workflow | Good | `build.yml` runs `npx projen build` on PRs. Self-mutation drift detection. Semantic PR title enforcement. Dependency upgrade automation. |
| PR template | Minimal | `.github/pull_request_template.md` contains only `Fixes #`. No validation checklist, risk section, or evidence requirements. |
| CONTRIBUTING.md | Missing | Not present. No formal contribution workflow documented. |
| Architecture / module docs | Partial | AGENTS.md describes top-level modules. `docs/testing.md` covers test strategy. `specs/` has detailed implementation plans. No explicit module boundary or ownership documentation. |
| Test commands (fast + full) | Good | `npx projen test:unit` (fast), `npx projen test:integration` (integration), `npx projen test` (full + coverage). Documented in AGENTS.md and `docs/testing.md`. |

### What this repo does well
- **Projen-managed consistency**: All config files, CI workflows, and task definitions are generated from `.projenrc.ts`. Drift is detected in CI via the self-mutation check. This prevents a whole class of configuration drift bugs.
- **Test infrastructure**: Three tiers (unit/integration/full) with clear naming conventions (`.integration.test.ts`, `.synth.test.ts`). `docs/testing.md` has actionable guidance on when to add which type.
- **Detailed specs**: `specs/conversion.md` and `specs/analysis.md` track implementation progress with checkboxes. An agent can look at these to understand what's done and what's next.

### Top 3 gaps
1. **PR template is a stub** — Contains only `Fixes #`. AI-generated PRs will lack structured validation evidence, risk assessment, and rollback notes. This is the single highest-impact gap for contribution quality.
2. **AGENTS.md lacks operational contract** — It covers context and test commands but omits forbidden actions, escalation triggers, regeneration rules, and "if you change X, run Y" workflows. An agent reading it would know *what the project is* but not *how to safely contribute*.
3. **No explicit safety rails** — No documented forbidden actions, no approval model for risky operations, no "never do this" list. An agent could modify `.projenrc.ts` without running `npx projen`, edit generated files directly, or skip the build before submitting.

### 3 concrete mismatches/surprises
1. **AGENTS.md references wrong filenames**: Line 33 says "Always check `spec.md` and `spec-cdk-analyze.md`" but the actual files are `specs/conversion.md` and `specs/analysis.md`.
2. **`mock-fs` is a runtime dependency**: Listed in `dependencies` (not `devDependencies`) in `package.json` despite being a test utility. This would ship to consumers.
3. **15.5 MB metadata file in repo**: `schemas/aws-native-metadata.json` is a large file tracked in git. No documentation on when/how to regenerate it (the `extract-identifiers` task exists but its relationship to this file isn't documented in AGENTS.md).

---

## Part 2: Implementation Packet

### Change 1: `.github/pull_request_template.md`
**Action:** edit (replace content)
**Why:** Gap #1 — PR template is a stub; AI PRs will lack evidence and structure.

```markdown
## Summary
<!-- What changed and why. Link to issue/spec if applicable. -->

Fixes #

## Validation
<!-- Commands you ran and their output. Copy-paste, don't paraphrase. -->
- [ ] `npx projen build` (compiles, lints, tests — all pass)
- [ ] `npx projen test:unit` (if only unit-level changes)
- [ ] `npx projen test:integration` (if pipeline/synth behavior changed)

## What changed
<!-- Brief list of files/modules affected and why. -->

## Risk
<!-- What could go wrong? What's the blast radius? "None" is a valid answer for low-risk changes. -->

## Rollback
<!-- How to revert if this causes problems. Usually: "Revert this PR." -->
```

**Verify:** `cat .github/pull_request_template.md`
**Expected:** Template with Summary, Validation checklist, What changed, Risk, and Rollback sections.

### Change 2: `AGENTS.md`
**Action:** edit (rewrite to add operational contract sections)
**Why:** Gap #2 — AGENTS.md lacks command canon, forbidden actions, escalation triggers, and regeneration rules.

```markdown
# Agent Guide: Pulumi CDK Conversion

Read @INSTRUCTIONS.md for projen usage rules.

## What this repo is
Standalone CLI toolchain to convert AWS CDK applications to Pulumi YAML.
Extracted from `pulumi-cdk` — the long-term goal is reintegration. Avoid decisions that permanently bifurcate.

Three components:
1. **Core** (`src/core/`) — IR-based conversion and analysis library
2. **CLI** (`src/cli/cli-runner.ts`) — `convert`, `analyze`, `ids` commands
3. **Analyzer** (`src/core/analysis/`) — CDK assembly inspection for migration planning

## Start here
- `src/cli/cli-runner.ts` — CLI entrypoint
- `src/core/ir.ts` — Intermediate Representation types
- `src/core/assembly/assembly-to-ir.ts` — Main conversion: manifest → ProgramIR
- `src/core/resolvers/` — CloudFormation intrinsic resolution
- `src/core/analysis/` — Assembly analyzer
- `specs/conversion.md` — Conversion CLI implementation plan (checkboxes)
- `specs/analysis.md` — Analyzer implementation plan (checkboxes)
- `docs/testing.md` — Test strategy and conventions

## Command canon
All commands go through projen. Do NOT use `npm run` directly except for `npm install`.

- **Build (compile + lint + test):** `npx projen build`
- **Compile only:** `npx projen compile`
- **Lint:** `npx projen eslint`
- **Fast tests (unit only):** `npx projen test:unit`
- **Integration tests:** `npx projen test:integration`
- **Full tests + coverage:** `npx projen test`
- **Run CLI locally:** `bun src/cli/cli-runner.ts`
- **Regenerate project files:** `npx projen`
- **Regenerate identifier schemas:** `npx projen extract-identifiers`

## Key invariants
- `src/core/` is the reusable library. It must not import from `src/cli/`.
- IR types in `src/core/ir.ts` are the contract between core and CLI.
- Test naming: `*.test.ts` (unit), `*.integration.test.ts` (integration), `*.synth.test.ts` (synth smoke).
- All config files (`package.json`, `tsconfig.json`, `.eslintrc.json`, CI workflows) are projen-generated. Edits go in `.projenrc.ts`.

## Forbidden actions
- Do not edit projen-generated files directly. Change `.projenrc.ts` and run `npx projen`.
- Do not use `npm run` for tasks — use `npx projen <task>`.
- Do not add dependencies by editing `package.json`. Use `addDeps()`/`addDevDeps()` in `.projenrc.ts`.
- Do not run `git push --force`, `git reset --hard`, or `rm -rf` without explicit approval.
- Do not skip the build (`npx projen build`) before declaring work complete.
- Do not fabricate test output or claim tests passed without running them.
- Do not import `src/cli/` from `src/core/` (breaks reintegration boundary).

## Escalate immediately if
- Requirements conflict with the reintegration goal.
- A change affects IR types in `src/core/ir.ts` (contract surface).
- Tests fail after two debugging attempts.
- You need to modify `.projenrc.ts` (affects all generated files).
- A change touches `schemas/aws-native-metadata.json` (15 MB, affects builds).

## If you change...
- Any `.ts` file in `src/` → run `npx projen build`
- `.projenrc.ts` → run `npx projen` then `npx projen build` (regenerates everything)
- `schemas/` data files → run `npx projen extract-identifiers` then `npx projen build`
- Test files → run `npx projen test:unit` (fast feedback), then `npx projen build`
- `specs/*.md` → no build needed, but update checkbox status as you complete tasks

## Todo tracking
- Check `specs/conversion.md` and `specs/analysis.md` before starting work
- Update checkboxes in spec files as you complete tasks

## Developer notes
- **Bun builds**: Used for standalone binary packaging (`npx projen package:*`). Use Node for local dev.
- **Asset handling**: Asset uploads are stubbed in CLI prototype.
- **Intrinsics**: Shared IR intrinsic resolver in `src/core/resolvers/`.
```

**Verify:** `wc -l AGENTS.md` — should be ~75-85 lines. Scan for all sections: command canon, forbidden actions, escalate, if you change.
**Expected:** Structured contract with all operational sections present.

### Change 3: Fix stale spec references in AGENTS.md
**Action:** already addressed in Change 2
**Why:** Mismatch #1 — AGENTS.md referenced `spec.md` and `spec-cdk-analyze.md` which don't exist. The rewritten AGENTS.md above uses the correct paths `specs/conversion.md` and `specs/analysis.md`.

**Verify:** `grep -c 'spec.md\|spec-cdk-analyze' AGENTS.md`
**Expected:** 0 matches (stale references removed).

### Change 4: `CLAUDE.md`
**Action:** edit (no change needed)
**Why:** Current content (`Read @AGENTS.md`) is correct and sufficient. CLAUDE.md correctly delegates to AGENTS.md. No action required — noting for completeness.

---

## Appendix: Category Assessment

| Category | Rating | Evidence |
|---|---|---|
| Instruction contract | Needs work | AGENTS.md exists but lacks operational contract (forbidden actions, escalation, regeneration rules). Fixed by Change 2. |
| Verification loop | Good | `test:unit` (~fast), `test:integration`, `test` (full). CI runs `npx projen build`. Local/CI parity via projen. |
| Safety rails | Needs work | No forbidden actions or approval model documented. Fixed by Change 2 (forbidden actions + escalation). |
| Architecture clarity | Adequate | AGENTS.md lists modules. `docs/testing.md` and `specs/` provide good context. Module boundaries implicit but inferable. |
| Task surface | Good | `.projen/tasks.json` defines all tasks. `npx projen <task>` is consistent. No Makefile needed. |
| Testability | Good | Three test tiers. `docs/testing.md` covers patterns. Fast path exists. Test structure mirrors src. |
| Observability | Minimal | `src/core/logging.ts` and `src/core/errors.ts` exist. No runbook or debug guide beyond `docs/testing.md`. Low priority for this project type. |
| Contribution ergonomics | Needs work | PR template is `Fixes #` only. No CONTRIBUTING.md. Fixed by Change 1. |
| Anti-drift controls | Good | Projen self-mutation CI check catches generated file drift. Dependency upgrade automation via `upgrade-main.yml`. |
