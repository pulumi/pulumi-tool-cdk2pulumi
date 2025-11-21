# Pulumi CDK Conversion Tooling

This repository contains the standalone toolchain for converting AWS CDK applications to Pulumi and analyzing CDK Cloud Assemblies.

**Note:** This code was extracted from the main `pulumi-cdk` repository to facilitate independent development of the conversion tools. The long-term goal is to reintegrate this functionality back into the `pulumi-cdk` library.

## Components

### 1. CDK to Pulumi Converter (`cdk-to-pulumi`)

A CLI tool that takes an existing AWS CDK application (specifically its Cloud Assembly), synthesizes it, converts the resulting CloudFormation templates into Pulumi resource definitions, and emits Pulumi YAML.

**Goal:** Provide a reusable conversion pipeline that operates on Cloud Assembly artifacts and returns a neutral intermediate representation (IR) for resources/outputs, which is then serialized to Pulumi YAML.

**Usage:**

```bash
# Convert a CDK Cloud Assembly to Pulumi YAML
bun src/cli/cli-runner.ts --assembly path/to/cdk.out
```

**Key Features:**
- Extracts reusable conversion logic into `src/core`.
- Supports `StackConverter` adaptation for both real Pulumi resources and IR.
- Serializes `ProgramIR` to Pulumi YAML.
- Supports stage selection via `--stage`.

### 2. CDK Assembly Analyzer (`cdk-to-pulumi analyze`)

A CLI command that inspects an AWS CDK Cloud Assembly and emits a structured report (JSON/YAML) highlighting details to help plan a CDK → Pulumi migration.

**Goal:** Summarize application structure, environments, construct usage, resource inventory, and other metadata.

**Usage:**

```bash
# Analyze a CDK Cloud Assembly
bun src/cli/cli-runner.ts analyze --assembly path/to/cdk.out --format json
```

**Key Features:**
- Detects language and heuristics.
- Enumerates stages and stacks.
- Extracts environment details (Account/Region).
- Analyzes construct tree (L1, L2, Custom, Third-party).
- Inventories resources and assets.

## Development

### Build

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Build standalone binary with Bun
npm run package:linux:arm
```

### Architecture

- **`src/core`**: Core logic for conversion, assembly reading, graph building, and IR generation.
- **`src/cli`**: CLI entrypoint and runners.
- **`src/`**: Source code.

## Documentation

- See [specs/conversion.md](./specs/conversion.md) for the detailed implementation plan of the Conversion CLI.
- See [specs/analysis.md](./specs/analysis.md) for the detailed implementation plan of the Analyzer.
