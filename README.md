# Pulumi CDK Conversion Tooling

This repository contains the standalone toolchain for converting AWS CDK applications to Pulumi and analyzing CDK Cloud Assemblies.

**Note:** This code was extracted from the main `pulumi-cdk` repository to facilitate independent development of the conversion tools. The long-term goal is to reintegrate this functionality back into the `pulumi-cdk` library.

## Components

### 1. CDK to Pulumi Converter (`cdk2pulumi`)

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
- Partial stack conversion: if you convert only consumer stacks, cross-stack references fall back to Pulumi config placeholders (`${external.<stack>.<output>}`), and the conversion report lists the required config keys. Set them with `pulumi config set external.<stack>.<output> <value>` before deployment.

### 2. CDK Assembly Analyzer (`cdk2pulumi analyze`)

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

### Custom resource emulation

When we rewrite CDK custom resources, we use the `aws-native:cloudformation:CustomResourceEmulator`, which requires an S3 bucket to stash payloads. CDK custom resources themselves do not depend on a bucket, but CDK apps already have a bootstrap asset bucket. We look for the asset manifest and reuse its bucket name when present; if the name cannot be found we still emit the emulator and omit `bucketName`, leaving it to future handling (or a different bucket strategy). We could swap to creating a dedicated bucket later if needed.
