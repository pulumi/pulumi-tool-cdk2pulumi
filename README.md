# Pulumi CDK Convert

Prototype CLI utilities for turning AWS CDK Cloud Assemblies into Pulumi YAML programs or analysis reports that describe the assembly structure.

## CLI Usage

### Convert synthesized assemblies to Pulumi YAML

```
npx cdk-to-pulumi --assembly ./cdk.out \
  --out ./Pulumi.yaml \
  --report ./Pulumi.yaml.report.json
```

Flags such as `--skip-custom`, `--stacks`, and `--stage` can be mixed in to control the conversion scope. The CLI emits a Pulumi YAML program alongside an optional JSON conversion report (disabled via `--no-report`).

### Analyze an assembly

```
npx cdk-to-pulumi analyze --assembly ./cdk.out \
  --stage Beta \
  --format json \
  --output ./analysis.json
```

The analyzer inspects stacks, constructs, environments, resources, and assets to produce a structured JSON (default) or YAML report. When `--output` is omitted the report prints to stdout, which makes it easy to pipe into other tooling.
