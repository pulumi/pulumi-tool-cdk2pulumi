# Pulumi CDK Conversion Tooling

> [!CAUTION]
> This is currently an **experimental** tool and may experience breaking changes.

Pulumi tool plugin for converting AWS CDK Cloud Assemblies to Pulumi programs, analyzing assemblies, and looking up import identifiers.

## Installation

Install the Pulumi tool plugin:

```bash
pulumi plugin install tool cdk2pulumi
```

## Commands and Examples

All commands run through the Pulumi CLI. Use `--` to pass arguments to the plugin.

### Convert a CDK assembly to Pulumi YAML

Produces `Pulumi.yaml` by default and a conversion report alongside it (`Pulumi.yaml.report.json`).

```bash
# Convert an entire assembly
pulumi plugin run cdk2pulumi -- --assembly path/to/cdk.out

# Target a specific stage (nested assembly) and write to a custom location
pulumi plugin run cdk2pulumi -- --assembly path/to/cdk.out --stage prod --out dist/prod/Pulumi.yaml

# Convert only certain stacks
pulumi plugin run cdk2pulumi -- --assembly path/to/cdk.out --stacks ApiStack,WorkerStack

# Skip CDK custom resources (useful for diffing only)
pulumi plugin run cdk2pulumi -- --assembly path/to/cdk.out --skip-custom
```

Notes:
- Cross-stack references in partially converted stacks become config placeholders (`${external.<stack>.<output>}`). Set them with `pulumi config set external.<stack>.<output> <value>` before deployment.
- Disable or relocate the conversion report with `--no-report` or `--report <path>`.

### Analyze a CDK assembly for migration planning

Outputs JSON by default; use `--format yaml` if preferred.

```bash
pulumi plugin run cdk2pulumi -- analyze --assembly path/to/cdk.out --format yaml --output reports/analysis.yaml
```

### Look up import identifiers (`ids`)

Returns the required Pulumi import ID shape for a resource token or CloudFormation type.

```bash
pulumi plugin run cdk2pulumi -- ids aws-native:acmpca:Certificate
pulumi plugin run cdk2pulumi -- ids AWS::S3::Bucket --json
```

Each result now includes a “Finding the ID” hint: single-part IDs suggest using the CloudFormation PhysicalResourceId, while composite IDs show an `aws cloudcontrol list-resources` example (adding `--resource-model '{...}'` when the Cloud Control list handler requires input).

## Developing

- Install dependencies: `npm install`
- Build: `npm run build`
- Package standalone binary with Bun: `npm run package`

Architecture and plans:
- Core conversion/analysis logic lives in `src/core`; the CLI entrypoint is `src/cli/cli-runner.ts`.
- Detailed implementation plans live in `specs/conversion.md` and `specs/analysis.md`.

Custom resource emulation: CDK custom resources are rewritten to `aws-native:cloudformation:CustomResourceEmulator`. The tool tries to reuse the CDK bootstrap asset bucket when present; otherwise the bucket name is omitted, leaving bucket handling to later configuration.

## Testing

```bash
# Fast feedback (unit tests only)
npm run test:unit

# Integration + synth tests
npm run test:integration

# Full suite with coverage
npm test
```

More details: `docs/testing.md`.
