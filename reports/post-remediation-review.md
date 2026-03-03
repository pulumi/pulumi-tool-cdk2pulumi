# Post-Remediation Review

**Date:** 2026-03-03
**Branch:** `chore/ai-readiness-audit-remediation`
**Reviewed against:**
- `reports/ai-readiness-synthesis.md` (Unified Remediation Plan, items 1-5)
- `reports/ai-contribution-readiness-audit.md` (Claude audit, Changes 1-4)
- `reports/ai-readiness-codex.md` (Codex audit, Changes 1-8)

---

## Satisfied Recommendations

### 1. AGENTS.md rewrite (Synthesis item 1; Claude Change 2; Codex Change 1)
**Status: DONE**

- Stale `spec.md` / `spec-cdk-analyze.md` references removed.
- Command canon, forbidden actions, escalation triggers, "if you change..." rules all present.
- High-level TODO section added with spec cross-references.
- Reintegration policy stated up front.

### 2. CONTRIBUTING.md creation (Synthesis item 2; Claude Change 1 implied; Codex Change 2)
**Status: DONE**

- File exists with: prerequisites, Projen rules, validation commands, AI-assisted contribution expectations, test placement guide.
- Content aligns with both audit recommendations.

### 3. PR template replacement (Synthesis item 3; Claude Change 1; Codex Change 3)
**Status: DONE**

- Template now has: Summary, Validation checklist, Risk & Blast Radius, Rollback Plan, Checklist.
- Matches both Claude and Codex specs almost verbatim.

### 4. Stale path fixes in `docs/intrinsics.md` (Synthesis item 4; Codex Change 6)
**Status: DONE**

- `src/ir/*` paths updated to `src/core/resolvers/*` and `src/core/ir.ts`.
- `tests/` updated to `test/`.
- `metadata.ts` path updated to `src/core/metadata.ts`.

### 5. Stale path fixes in `specs/conversion.md` (Synthesis item 4; Codex Change 7)
**Status: DONE**

- Package script names corrected (`package:linux-arm64`, `package:darwin-arm64`).
- Binary output paths corrected (`pulumi-tool-cdk2pulumi`).
- `tests/cli/` and `tests/ir/` updated to `test/cli/` and `test/ir/`.

### 6. Stale path fix in `specs/analysis.md` (Synthesis item 4; Codex Change 8)
**Status: DONE**

- `spec.md` reference updated to `specs/conversion.md`.

### 7. CLAUDE.md symlink (Synthesis item 5)
**Status: DONE**

- `CLAUDE.md` is now a symlink to `AGENTS.md` (confirmed: `lrwxr-xr-x CLAUDE.md -> AGENTS.md`).

---

## Remaining Gaps

### Gap 1: `docs/architecture.md` not created (Codex Change 4)
**Impact: Low-Medium**

Codex recommended a dedicated module map file (`docs/architecture.md`) with Module Map, Boundaries, and Common Change Patterns sections. This was not created. The AGENTS.md rewrite partially covers this (Major areas, Start Here, If You Change...), but the dedicated architecture doc with explicit module boundary rules and common change patterns is absent.

**Recommendation:** Optional. AGENTS.md covers the critical navigation needs. Create only if agents are observed struggling with file targeting.

### Gap 2: Non-mutating Projen tasks not added (Codex Change 5)
**Impact: Medium**

Codex recommended adding `lint:check`, `test:unit:ci`, and `verify:ai` tasks to `.projenrc.ts` to provide non-mutating verification paths. No `.projenrc.ts` changes were made. The synthesis report explicitly scoped this out: "Skip introducing new Projen tasks in this pass to keep changes minimal and avoid generated-file churn."

**Recommendation:** Consider for a follow-up pass. The `test:unit` task currently runs `jest --updateSnapshot` which can silently mutate snapshots; a `--ci` variant would catch unintended snapshot drift in AI-generated PRs.

### Gap 3: `mock-fs` in runtime dependencies (Claude mismatch #2)
**Impact: Low**

Claude flagged `mock-fs` as a runtime dependency (in `dependencies` rather than `devDependencies`). Not addressed in this pass — correctly out of scope for a docs/guidance remediation branch, but worth a follow-up fix.

### Gap 4: `schemas/aws-native-metadata.json` documentation (Claude mismatch #3)
**Impact: Low**

Claude noted the 15.5 MB metadata file lacks regeneration documentation. AGENTS.md now mentions `npx projen extract-identifiers` in the "If You Change..." section (via `schemas/` data files), which partially addresses this. A full explanation of when/why to regenerate is not present.

---

## Summary

| Remediation Item | Source | Status |
|---|---|---|
| AGENTS.md rewrite | All three reports | Done |
| CONTRIBUTING.md | All three reports | Done |
| PR template | All three reports | Done |
| `docs/intrinsics.md` path fixes | Codex, Synthesis | Done |
| `specs/conversion.md` path fixes | Codex, Synthesis | Done |
| `specs/analysis.md` path fix | Codex, Synthesis | Done |
| CLAUDE.md symlink | Synthesis | Done |
| `docs/architecture.md` | Codex only | Not done (low priority) |
| Non-mutating Projen tasks | Codex only | Scoped out (follow-up) |
| `mock-fs` dep placement | Claude only | Out of scope |
| Metadata regeneration docs | Claude only | Partially addressed |

**Verdict:** 7/7 scoped items implemented. 4 remaining items are either explicitly deferred, low priority, or out of scope for this documentation-focused pass. The branch satisfies the unified remediation plan from the synthesis report.
