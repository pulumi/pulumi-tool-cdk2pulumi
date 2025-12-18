# Dynamic CDK Synthesis Test Migration

This document tracks the migration of static test fixtures to dynamically synthesized CDK tests using `@aws-cdk/toolkit-lib`.

## Goals
- Replace static `test-data/` directories with inline CDK definitions
- Improve test maintainability and coverage
- Enable testing of real CDK construct behavior via realistic synthesis

## Status Overview
- [x] Phase 1: Infrastructure (helpers, setup)
- [ ] Phase 2: Proof of concept tests
- [ ] Phase 3: Migrate existing tests
- [ ] Phase 4: Remove static test-data directories

---

## Phase 1: Infrastructure

### Test Utilities
- [x] Create `test/synth/helpers.ts` with core synthesis utilities
- [x] Add `@aws-cdk/toolkit-lib` as dev dependency

---

## Phase 2: Proof of Concept Tests

### Basic Resource Tests (`test/synth/basic-resources.synth.test.ts`)
- [x] S3 Bucket conversion
- [x] SQS Queue conversion
- [x] SQS Queue with dead letter queue dependencies
- [x] Multi-stack app handling
- [x] Stack filtering

---

## Phase 3: Test Migration

### `test/cli/ir-post-processor.test.ts` (17 tests)
- [ ] converts API Gateway V2 Stage to aws classic type
- [ ] converts Service Discovery Service to aws classic type
- [ ] converts Service Discovery Private DNS Namespace to aws classic type
- [ ] converts IAM policies to RolePolicy resources instead of inlining
- [ ] rewrites custom resources to emulator when staging bucket is present
- [ ] rewrites custom resources to emulator using provided bucket name
- [ ] replaces AWS::AccountId intrinsic in bootstrap bucket names
- [ ] skips custom resources when option enabled
- [ ] drops unsupported aws-native resources and reports them
- [ ] does not drop classic fallbacks as unsupported
- [ ] converts Route53 RecordSet to aws classic type
- [ ] converts Route53 RecordSet TXT records
- [ ] converts Route53 RecordSet with alias target
- [ ] converts Route53 RecordSet with weighted routing policy
- [ ] converts Route53 RecordSet with geolocation routing policy
- [ ] converts Route53 RecordSet with failover routing policy
- [ ] converts SQS QueuePolicy to classic and fans out per queue

### `test/ir/stack-converter.test.ts` (2 tests)
- [ ] converts resources with options and outputs
- [ ] resolves joins, splits, conditionals, and dynamic references

### `test/assembly/assembly-to-ir.test.ts` (5 tests)
- [ ] converts root and nested stacks from manifest
- [ ] convertAssemblyDirectoryToProgramIr loads manifest via reader
- [ ] convertStageInAssemblyDirectoryToProgramIr loads nested manifest
- [ ] convertAssemblyToProgramIr skips stacks outside filter set
- [ ] Fn::ImportValue references resolve to stack output references

### `test/cli/ir-to-yaml.test.ts` (7 tests)
- [ ] serializes resources, options, and parameter defaults
- [ ] uses logical IDs as emitted resource names
- [ ] lowercases logical IDs for resources that require it
- [ ] inlines stack output references across stacks
- [ ] replaces missing producer stack outputs with config.require
- [ ] records external config requirements in report collector
- [ ] escapes interpolation markers inside literal strings

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

## Tests That Should Stay Static

Some tests may be better served by static fixtures:
- Tests for malformed manifests/templates (edge case error handling)
- Tests for specific manifest.json structures
- Tests for assets (Docker images, file assets)

---

## Technical Notes

### toolkit-lib Configuration
- Uses `clobberEnv: false` to allow parallel test execution without process.env conflicts
- Each test gets its own temp directory for synthesis output

### CDK Construct Behavior
- CDK constructs create deterministic logical IDs based on construct path
- Use `cfnType` matching for assertions instead of relying on specific logical IDs
- Use `CfnXxx` escape hatches when precise CloudFormation control is needed
