# Testing Strategy & Migration Checklist

This document tracks the testing improvements for `cdk2pulumi`.
The goal is a fast local loop, targeted unit tests, and a small set of realistic
integration tests (CDK synthesis) with minimal static fixtures.

## Goals
- [ ] Keep unit tests fast and focused on core logic (`src/core`, `src/cli`).
- [ ] Use synth-based integration tests for realistic CDK behavior.
- [ ] Reduce reliance on static `test/test-data/` fixtures.
- [ ] Make test expectations explicit for unsupported features.
- [ ] Keep test output small and stable (avoid huge snapshots).

---

## Unit Tests (IR / Core)

### Intrinsic Resolver
- [x] `Ref` resolves parameters to IR parameter references.
- [x] `Ref` resolves outputs to IR stack output references.
- [x] `Ref` returns undefined for missing targets.
- [x] `Ref` returns undefined for pseudo-parameters (documented current behavior).
- [x] `Ref` returns undefined for `AWS::NoValue`.
- [x] `Fn::GetAtt` resolves to resource attribute references.
- [x] `Fn::Join` produces concat values when mixed types are present.
- [x] `Fn::Split` resolves string inputs to arrays.
- [x] `Fn::Split` returns undefined for non-string sources.
- [x] `Fn::Select` supports numeric and string indices.
- [x] `Fn::Select` returns undefined for out-of-range indices.
- [x] `Fn::Sub` resolves inline variables.
- [x] `Fn::Sub` resolves resource attribute references.
- [x] `Fn::Sub` honors literal escape `${!`.
- [ ] `Fn::Sub` with variable map + resource references in the same template.
- [x] `Fn::FindInMap` resolves happy path.
- [x] `Fn::FindInMap` errors for missing map / keys.
- [x] `Fn::FindInMap` errors for invalid argument count.
- [x] `Fn::Base64` resolves literals.
- [x] `Fn::If` evaluates true/false branches.
- [x] `Fn::If` errors on missing conditions.
- [x] `Fn::And`/`Fn::Or`/`Fn::Not` evaluate correctly.
- [x] `Fn::And`/`Fn::Or`/`Fn::Not` enforce argument counts.
- [x] `Fn::ImportValue` resolves when export is known.
- [x] `Fn::ImportValue` errors when export is unknown.
- [ ] `Fn::ImportValue` errors when export name is not a string.
- [x] Unsupported intrinsics error messages (Transform, Cidr, GetAZs).
- [ ] Condition scoping when identically-named conditions exist in multiple stacks.

### Stack Conversion
- [x] Converts resources with options (`DependsOn`, `DeletionPolicy=Retain`).
- [x] Supports `DependsOn` arrays.
- [x] Emits outputs with descriptions.
- [x] Skips outputs that resolve to `AWS::NoValue`.
- [x] Resolves dynamic references (SSM, Secrets Manager) in properties/outputs.
- [x] Resolves `Fn::If` true branch with matching parameter default.
- [ ] Converts resource-level `Condition` fields (if supported).
- [ ] Captures output `Export` metadata if/when required.

### Dynamic Reference Parsing
- [x] SSM plaintext references (with/without version).
- [x] SSM secure references.
- [x] Secrets Manager references (basic).
- [x] Secrets Manager references with extra colons.
- [x] Secrets Manager references with ARN + jsonKey.
- [x] Secrets Manager references with versionStage/versionId.
- [ ] Invalid dynamic reference patterns return undefined.

---

## Unit Tests (CLI / Serialization)
- [x] Serialize SSM dynamic references (plaintext/secure).
- [x] Serialize Secrets Manager dynamic references (string/binary).
- [x] Serialize Secrets Manager version selectors.
- [x] Error when Secrets Manager dynamic reference uses jsonKey.
- [ ] Error when parameter reference has no default (serializePropertyValue).
- [ ] Stack output reference resolution errors when outputs are missing.

---

## End-to-End Smoke Tests (Synth)
- [x] Basic pipeline smoke (`test/synth/basic-resources.synth.test.ts`).
- [x] Post-processor pipeline smoke (`test/synth/ir-post-processor.synth.test.ts`).
- [x] YAML serialization smoke for intrinsics using synthesized app.
- [ ] Add smoke for `Fn::Sub` with `${AWS::Region}` / `${AWS::AccountId}` if supported.
- [ ] Add smoke for `Fn::ImportValue` when cross-stack support is available.

---

## Fixture Migration
- [ ] Replace `test/test-data/cdk-assembly.out` with synthesized fixture.
- [x] Replace `test/test-data/cdk-with-stages.out` with synthesized stage app.
- [x] Replace `test/test-data/staged-assembly` with synthesized fixtures.
- [x] Replace `test/test-data/nested-stack` with synthesized fixture.
- [x] Replace `test/test-data/custom-resource-stack` with synthesized fixture.
- [ ] Keep `test/test-data/app` only if needed for Docker asset tests.

---

## Documentation
- [x] Add testing guide (`docs/testing.md`).
- [x] Add `README` testing commands.
- [ ] Add section documenting unsupported intrinsics and pseudo-parameters.
