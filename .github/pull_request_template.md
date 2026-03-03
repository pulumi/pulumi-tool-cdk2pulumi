## Summary

- What changed?
- Why was it needed?
- Link issue/spec/task.

Fixes #

## Validation

- [ ] `npx projen compile`
- [ ] `npx projen test:unit`
- [ ] `npx projen test:integration` (required for CLI/analyzer behavior changes)
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