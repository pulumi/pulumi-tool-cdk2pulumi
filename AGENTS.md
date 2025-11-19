# Agent Guide: Pulumi CDK Conversion

This document guides agents working on the `pulumi-cdk-convert` workspace.

## Context

We are working in `pulumi-cdk-convert`, a repository extracted from the main `pulumi-cdk` project. This repo houses the standalone toolchain to convert AWS CDK applications to Pulumi.

**Long-term Goal:** While we develop here for velocity and separation of concerns, the ultimate goal is to reintegrate these tools back into `pulumi-cdk`. Avoid decisions that would permanently bifurcate the codebases or make reintegration difficult.

The project involves:
1.  **Conversion Core**: A neutral Intermediate Representation (IR) for CDK constructs/resources.
2.  **CLI**: A tool to drive conversion and analysis without needing the full Pulumi CLI runtime for execution.
3.  **Analyzer**: A tool to inspect CDK assemblies and report on their structure/complexity to aid migration planning.

## Current Status

- **Core Package**: `packages/cdk-convert-core` has been created. Much of the logic (assembly, graph, cfn, sub, stack-map) has been moved here.
- **CLI**: `bin/cdk-to-pulumi` exists and can convert assemblies to Pulumi YAML.
- **Analyzer**: Scaffolding exists for `cdk-to-pulumi analyze`.

## Key Documents

- **`specs/conversion.md`**: The master plan for the Conversion CLI. Check this for "Detailed TODOs" regarding Package Extraction, IR, CLI Prototype, and Stage Support.
- **`specs/analysis.md`**: The master plan for the Assembly Analyzer. Check this for implementation tasks regarding Analysis Data Model, Language Detection, Construct Analysis, etc.

## Workflows

### Updating the Implementation Plans

Always check `spec.md` and `spec-cdk-analyze.md` before starting work. Update the checkboxes in these files as you complete tasks.

### Running Tests

- **Unit Tests**: Run `npm test` to execute unit tests.
- **Integration Tests**: Check `tests/cli/` for CLI integration tests.

## Todo List (High Level)

### Conversion CLI (`specs/conversion.md`)


### Analyzer (`specs/analysis.md`)
- [ ] **Resource Inventory**: Determine which resources rely on assets.
- [ ] **Custom Resource Details**: Identify custom resources, trace back to Lambda handlers.
- [ ] **Asset Usage**: List file/docker assets and highlight usage.
- [ ] **Testing**: Add unit and golden snapshot tests for the analyzer.

## Developer Notes

- **Bun Builds**: We use Bun for standalone binary builds (`npm run build:bun-cli`). Keep using Node for local dev.
- **Asset Handling**: Currently, asset uploads might be skipped or stubbed in the CLI prototype.
- **Intrinsics**: We are moving towards a shared IR intrinsic resolver.

Refer to the specific spec files for the most up-to-date granular tasks.
