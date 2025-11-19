# CDK Assembly Analyzer – Implementation Plan

## Goal
Introduce a new CLI command that inspects an AWS CDK Cloud Assembly (the same `cdk.out` directory that the converter consumes) and emits a structured report highlighting details that will help an LLM plan a CDK → Pulumi migration. The report must summarize application structure, environments, construct usage, resource inventory, and other metadata outlined below.

## Background & Constraints
- The `cdk-to-pulumi` CLI and `packages/cdk-convert-core` library are now established in this repository.
- Existing `packages/cdk-convert-core` already knows how to parse the manifest, tree, and templates for conversion. The analyzer should reuse those readers whenever possible (e.g., `AssemblyManifestReader`, `StackManifest`).
- Inputs:
  - `manifest.json` → artifacts (stacks, nested assemblies, asset manifests), stack environments, stage metadata.
  - `tree.json` → construct hierarchy, `constructInfo.fqn`, metadata/attributes (e.g., `aws:cdk:cloudformation:type` for L1 resources).
  - Stack templates (`*.template.json`) → CloudFormation resources, properties, metadata (custom resources, assets, environments).
- Outputs should be machine-consumable (JSON or YAML). Prefer JSON to simplify ingestion by LLM pipelines.
- Analyzer must work on the root assembly and nested stages (`cdk:cloud-assembly` artifacts). Stages may have different environments and stacks.
- Need heuristics for classifying constructs/resources:
  - `aws-cdk-lib.*` → core L2/L3 constructs.
  - `constructs.Construct` with no other prefix → likely user-defined (expand children one level deeper).
  - Third-party constructs (non `aws-cdk-lib`, non `constructs.Construct`) should be captured with package prefix.
  - L1 resources: `fqn` starting with `aws-cdk-lib.aws_xyz.Cfn*` and/or attributes containing `aws:cdk:cloudformation:type`.
  - Custom resources: `aws-cdk-lib.CustomResource`, `aws-cdk-lib.CfnResource` with `Type` starting `Custom::`, or metadata `aws:cdk:is-custom-resource-handler-customResourceProvider`.
  - Assets: look at template resource Metadata `aws:asset:path` / asset manifests.
- Determine language from manifest `runtime.libraries` heuristics (e.g., `typescript` dependency presence). If unavailable, fall back to extension inference using asset metadata or CLI flag? Document limitations.

## Desired Report Sections
1. **App Summary**
   - Detected language + heuristics/uncertainty.
   - Whether stages are used (presence of `cdk:cloud-assembly` artifacts, Stage constructs in tree).
   - Stages list with contained stacks.
   - Stacks existing without stages.
2. **Environments**
   - For each stage/stack: target account & region extracted from `artifact.environment` (format `aws://ACCOUNT/REGION`).
   - Note stacks with `unknown-account` or missing region.
3. **Construct Usage**
   - Count of constructs by type (L1 vs L2 vs custom vs third-party).
   - Inventory of user-defined construct paths (expand one level deeper).
   - Detect usage of `aws-cdk-lib.pipelines.*`.
   - Identify `CustomResource` usage plus associated handler info (service token logical IDs, referenced Lambda functions, assets).
4. **Resource Inventory**
   - Count and list CloudFormation resource types across all stacks.
   - Map each type to stack(s) and logical IDs.
   - Flag resources that depend on assets (metadata `aws:asset:*` or asset manifest entries).
5. **Lambda/Asset Details**
   - For custom resources or other assets, capture associated Lambda runtime/handler (from metadata or template).
6. **L2 vs Custom Org Constructs**
   - Count `aws-cdk-lib` constructs vs non-aws constructs vs `constructs.Construct`.
   - Provide breakdown in report.

## Proposed CLI Shape
- Extend existing binary with a new subcommand `cdk-to-pulumi analyze` (or similar). Options:
  - `--assembly <path>` (required).
  - `--stage <name>` to scope to nested assembly.
  - `--format json|yaml` default json.
  - `--output <file>` or stdout.
  - Possibly `--include-resources` toggles for expensive sections.
- Implementation flow:
  1. Load manifest (or nested stage) via `AssemblyManifestReader`.
  2. Traverse tree/stack templates to build intermediate `AnalysisReport` structure.
  3. Serialize to requested format.

## Implementation Tasks

- Current status: Core analysis module scaffolding (orchestrator, report schema, initial helpers) is in place. Next focus is building out construct/resource/asset population logic.

### 1. Analysis Data Model
- [x] Introduce a new `packages/@pulumi/cdk-convert-core/src/analysis` module with:
  - `AssemblyAnalyzer` orchestrator.
  - Types: `AnalysisReport`, `StageSummary`, `StackSummary`, `ConstructSummary`, `ResourceSummary`, etc.
  - Utility functions for language detection, construct classification, environment parsing.
- [x] Define JSON schema / TypeScript interfaces for the report and document them.

### 2. Language Detection Heuristics
- [x] Inspect `manifest.runtime?.libraries` for `typescript`, `ts-node`, `jsii`, `aws-cdk-lib` dependencies to infer language.
- [x] Fallback: scan asset entries/metadata for `.ts`, `.py`, `.cs` patterns.
- [x] Surface `confidence` or `notes` describing detection reliability.

### 3. Stage & Stack Enumeration
- [x] Use `AssemblyManifestReader` to list stacks and nested assemblies.
- [x] For each nested assembly, load corresponding manifest by reusing `loadNestedAssembly`.
- [x] Build hierarchical summary: `stage -> stacks -> nested stacks`.
- [x] Flag apps without stages (single root assembly) vs multi-stage.

### 4. Environment Extraction
- [x] Parse `artifact.environment` (`aws://ACCOUNT/REGION`) for each stack; normalize missing account/region.
- [x] Provide summary table of all unique environments.

### 5. Construct Tree Analysis
- [x] Traverse `tree.json` starting at the relevant stage root.
- [x] For `aws-cdk-lib` nodes: record once and skip traversing children unless flagged (e.g., assets/custom resource handling).
- [x] For `constructs.Construct` nodes: capture child nodes (one level) to represent custom constructs.
- [x] For third-party constructs: record their fqn and optionally count children if relevant.
- [x] Count occurrences per FQN, categorize into:
    - `coreL2` (aws-cdk-lib non `Cfn*`),
    - `l1` (`Cfn` or metadata with `aws:cdk:cloudformation:type`),
    - `customResource` (special-case),
    - `userDefined` (constructs.Construct / repo namespace),
    - `thirdParty`.
- [x] Detect CDK Pipelines by scanning for `aws-cdk-lib.pipelines.*` FQNs or stage artifacts with pipeline stacks; record pipeline stage names, synth/deploy stacks, etc.

### 6. Resource Inventory
- [x] Iterate stack templates (including nested stacks) to gather `Type`, `LogicalId`, and stack path.
- [x] Track counts and map of `AWS::Service::Resource` → list of occurrences.
- [ ] Determine which resources rely on assets by checking metadata `aws:asset:*` or references to asset manifest entries (metadata coverage implemented; asset manifest correlation pending).

### 7. Custom Resource Details
- [ ] Identify resources where `Type` starts with `Custom::` or `AWS::CloudFormation::CustomResource`.
- [ ] Record service token sources (logical IDs, references).
- [ ] Trace back to Lambda handlers (via `Fn::GetAtt` target) to capture runtime, handler, code location, and associated assets (`assetPath` metadata).
- [ ] Group resources by custom resource type.

### 8. Asset Usage
- [ ] Use asset manifest data plus template metadata to list file/docker assets.
- [ ] Highlight stacks/constructs referencing assets.
- [ ] Flag Lambda functions or custom resources packaged as assets (so migration can plan asset handling).

### 9. CLI Integration
- [x] Extend `src/cli/cli-runner.ts` to support an `analyze` subcommand (or new entry file if cleaner).
- [x] Wire CLI options and ensure compatibility with existing `npm bin`.
- [x] Choose output format (default JSON) and pretty-print.

### 10. Testing
- [ ] Unit tests for analyzer helpers (language detection, construct classification, pipeline detection).
- [ ] Golden snapshot tests using fixtures (`cdk.out/`, `cdk-with-stages.out/`) verifying report contents.
- [ ] CLI integration tests invoking `cdk-to-pulumi analyze` to ensure output generation.

### 11. Documentation & Spec Updates
- [ ] Update `spec.md` + `AGENTS.md` to reference the analyzer work and cross-link with this spec.
- [ ] Document CLI usage in `README.md`.
- [ ] Note limitations (language detection uncertainty, unsupported macros, etc.).

## Open Questions / Follow-Ups
1. Should the analyzer produce both high-level summary and raw details (maybe two sections) to keep LLM prompts smaller?
2. Do we need to support streaming/partial output for large assemblies?
3. How should the analyzer represent nested constructs referencing the same logical resource (dedup vs repeated entries)?
4. Should we include dependency graphs (which stacks depend on others) using `artifact.dependencies`?
5. Any correlation with future migration assistant pipeline (e.g., output location, JSON schema versioning)?

Keep this document updated as decisions are made. Each checkbox above should be marked in place as tasks complete.
