# Multi-Model AI Contribution Readiness Synthesis

## Inputs
- Claude report: `reports/ai-contribution-readiness-audit.md` (referenced by `reports/ai-readiness-claude.md`)
- Codex report: `reports/ai-readiness-codex.md`
- Date: 2026-03-03
- Models used: Claude Opus, Codex (subagent)

## Consensus Findings (High Confidence)
1. PR template is too minimal (`.github/pull_request_template.md` only has `Fixes #`) and does not enforce validation evidence or risk disclosure.
2. `AGENTS.md` is partially stale and missing stronger operational guidance (current spec-path references and clear contribution guardrails).
3. Safety rails and contributor workflow are under-documented (no `CONTRIBUTING.md`; expectations for verification and generated-file handling are split across files).
4. Repo has strong foundations (Projen-managed CI, anti-drift checks, clear test tiers, detailed implementation specs).

## Disagreements / Divergence
- Claude was narrower and prioritized 3 gaps + one path-mismatch finding.
- Codex produced a broader remediation packet (including docs/spec path fixes and optional task additions).
- Assessment: Codex has better implementation specificity; Claude has tighter prioritization. Combine both by implementing minimal high-impact edits first.

## Unique Insights
- Claude explicitly flagged stale path references in AGENTS (`spec.md`, `spec-cdk-analyze.md` vs `specs/conversion.md`, `specs/analysis.md`).
- Codex additionally flagged stale references in `docs/intrinsics.md` and `specs/conversion.md` package script names.
- User-provided policy addition: `CLAUDE.md` must be a symlink to `AGENTS.md`.

## Unified Remediation Plan
1. Rewrite `AGENTS.md` as the single operational contract with correct spec paths and explicit guardrails.
2. Create `CONTRIBUTING.md` with workflow and validation expectations.
3. Replace `.github/pull_request_template.md` with evidence/risk/rollback sections.
4. Fix stale references in docs/specs (`docs/intrinsics.md`, `specs/conversion.md`, `specs/analysis.md`).
5. Enforce `CLAUDE.md -> AGENTS.md` symlink.

## Scope Chosen For This Pass
- Implement items 1-5 above.
- Skip introducing new Projen tasks in this pass to keep changes minimal and avoid generated-file churn.
