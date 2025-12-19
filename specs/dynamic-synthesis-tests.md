# Dynamic CDK Synthesis Test Migration

This document tracks the migration of static test fixtures to dynamically synthesized CDK tests using `@aws-cdk/toolkit-lib`.

## Goals
- Use synth tests to validate real CDK behavior and end-to-end conversion.
- Keep unit tests as the primary place for edge cases and error handling.
- Replace static fixtures only when synth tests provide equal or better signal.
- Keep static fixtures for malformed inputs and asset-specific cases.

## Status Overview
- [x] Phase 1: Infrastructure (helpers, setup)
- [x] Phase 2: Proof of concept tests
- [ ] Phase 3: Migrate existing tests
- [ ] Phase 4: Remove static test-data directories

---

## Test Strategy

### Unit Tests vs Integration Tests (Scope and Guardrails)

We maintain two layers of testing:

1. **Unit tests** (e.g., `test/cli/ir-post-processor.test.ts`)
   - Test functions in isolation with hand-crafted inputs
   - Fast execution (~0.5s per test)
   - Good for precise edge cases and specific transformations
   - Keep these for fast feedback during development
   - **Never replace unit tests with synth tests for error paths**

2. **Integration tests** (e.g., `test/synth/ir-post-processor.synth.test.ts`)
   - Synthesize real CDK apps using `@aws-cdk/toolkit-lib`
   - Verify the full pipeline: CDK → synthesis → convert → post-process
   - Slower (~10s for synthesis) but test realistic scenarios
   - Use `beforeAll` to synthesize once, then run multiple fast assertions
   - **Do not snapshot entire YAML**; assert on small, stable fragments
   - **Avoid heavy fixtures**; prefer minimal apps that demonstrate behavior

### Integration Test Pattern

```typescript
describe('Integration', () => {
  let processed: ProgramIR;

  beforeAll(async () => {
    // Single synthesis for all tests in this suite
    const program = await synthesizeAndConvert(() => createComprehensiveApp());
    processed = postProcessProgramIr(program);
  }, 60000);

  test('converts X', () => {
    // Fast assertion against pre-synthesized output
    expect(findResource(processed, 'aws:x/y:Z')).toBeDefined();
  });
});
```

---

## Phase 1: Infrastructure

### Test Utilities
- [x] Create `test/synth/helpers.ts` with core synthesis utilities
- [x] Add `@aws-cdk/toolkit-lib` as dev dependency

---

## Phase 2: Proof of Concept Tests

### `test/synth/basic-resources.synth.test.ts` ✓

Integration tests for core assembly-to-IR conversion:

**Basic Resources Suite** (single synthesis):
- [x] S3 Bucket conversion
- [x] SQS Queue with property mapping
- [x] Resource dependencies (DLQ)

**Multi-Stack Apps Suite** (single synthesis, tests filtering):
- [x] Multiple stacks in app
- [x] Stack filtering with `stackFilter` option

---

## Phase 3: Test Migration

### `test/synth/ir-post-processor.synth.test.ts` ✓

Integration tests using a comprehensive CDK app with all post-processed resource types:

**Main Integration Suite** (single synthesis, ~15 assertions):
- [x] API Gateway V2 Stage → `aws:apigatewayv2/stage:Stage`
- [x] Service Discovery PrivateDnsNamespace → `aws:servicediscovery/privateDnsNamespace:PrivateDnsNamespace`
- [x] Service Discovery Service → `aws:servicediscovery/service:Service`
- [x] IAM Policy → `aws:iam/rolePolicy:RolePolicy`
- [x] Route53 RecordSet (A, TXT, alias, weighted, geolocation, failover)
- [x] SQS QueuePolicy fan-out per queue
- [x] Custom Resource → `aws-native:cloudformation:CustomResourceEmulator`
- [x] Unsupported resources dropped and reported
- [x] Classic fallbacks not reported as unsupported

**Options Suite** (separate syntheses for isolation):
- [x] `skipCustomResources` removes custom resources
- [x] `bootstrapBucketName` with `${AWS::AccountId}` intrinsic replacement
- [x] `bootstrapBucketName` with literal value
- [x] Staging bucket auto-detection from StagingStack

### `test/ir/stack-converter.test.ts`
- [x] converts resources with options and outputs
- [x] resolves joins, splits, conditionals, and dynamic references

### `test/assembly/assembly-to-ir.test.ts` (5 tests)
- [ ] converts root and nested stacks from manifest
- [ ] convertAssemblyDirectoryToProgramIr loads manifest via reader
- [ ] convertStageInAssemblyDirectoryToProgramIr loads nested manifest
- [ ] convertAssemblyToProgramIr skips stacks outside filter set
- [ ] Fn::ImportValue references resolve to stack output references

### `test/cli/ir-to-yaml.test.ts` (7 tests)
- [x] serializes resources, options, and parameter defaults
- [x] uses logical IDs as emitted resource names
- [x] lowercases logical IDs for resources that require it
- [x] inlines stack output references across stacks
- [x] replaces missing producer stack outputs with config.require
- [x] records external config requirements in report collector
- [x] escapes interpolation markers inside literal strings

---

## Phase 4: Static Test Data Removal

### Directories to Remove (after full migration)
- [ ] `test/test-data/cdk-assembly.out/` - Replace with synthesized fixtures
- [ ] `test/test-data/cdk-with-stages.out/` - Replace with stage synthesis
- [ ] `test/test-data/staged-assembly/` - Replace with synthesized fixtures
- [ ] `test/test-data/nested-stack/` - Replace with nested stack synthesis
- [ ] `test/test-data/custom-resource-stack/` - Replace with CR synthesis
- [ ] `test/test-data/app/` - Keep if used for Docker asset tests

---

## Tests That Should Stay Static (Explicit)

Keep static fixtures for:
- Malformed manifests/templates (edge case error handling)
- Specific `manifest.json` structures that are hard to synthesize
- Asset workflows (Docker images, file assets) that require real files

---

## Migration Decision Checklist

Before replacing a fixture with synthesis, confirm:
- [ ] The behavior is not primarily an error path (if it is, keep unit tests).
- [ ] A minimal CDK app can express the scenario.
- [ ] Assertions can be made on stable fragments (not full snapshots).
- [ ] The synth test runs in a single suite with one synthesis.

---

## Technical Notes

### toolkit-lib Configuration
- Uses `clobberEnv: false` to allow parallel test execution without process.env conflicts
- Synthesis output is managed by toolkit-lib (no manual temp directories needed)

### CDK Construct Behavior
- CDK constructs create deterministic logical IDs based on construct path
- Use `cfnType` matching for assertions instead of relying on specific logical IDs
- Use `CfnXxx` escape hatches when precise CloudFormation control is needed

### Performance Tips
- Use `beforeAll` to synthesize once per test suite
- Group related assertions under a single synthesis
- Only create separate syntheses when testing options that affect the entire pipeline
