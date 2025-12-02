# cdk2pulumi import identifiers command

## Goal

Add a small CLI utility `cdk2pulumi ids <pulumi-type|cfn-type>` that explains how to import an existing resource by surfacing the Pulumi import ID format plus a breakdown of each identifier segment. The command should be self-contained (no network calls) and rely on the precomputed schema artifacts already in the repo.

## Data sources

- `schemas/primary-identifiers.json` (authoritative): maps CloudFormation type → `{ provider, primaryIdentifier: { parts[], format }, pulumiTypes[], note? }`.
- `schemas/aws-native-metadata.json`: for aws-native resources, provides `inputs`/`outputs` dictionaries with descriptions; also lists `primaryIdentifier` for cross-checking.
- `schemas/aws-import-docs.json` (optional garnish for AWS classic): contains the Terraform-style import doc text and the Pulumi AWS token (`awsType`).

## CLI UX

- Usage: `cdk2pulumi ids <type> [--json]`
  - `<type>` accepts either a Pulumi token (`aws-native:acmpca:Certificate`, `aws:fsx/openZfsVolume:OpenZfsVolume`) or the CFN type (`AWS::ACMPCA::Certificate`). Exact, case-sensitive match.
  - `--json` outputs a machine-friendly object; default is human-readable text.
- Example text output:
  ```
  Resource: aws-native:acmpca:Certificate (CFN: AWS::ACMPCA::Certificate, provider: aws-native)
  Format: {arn}/{certificateAuthorityArn}
  Parts:
    - arn (Output): The Amazon Resource Name (ARN) of the issued certificate.
    - certificateAuthorityArn (Input): The Amazon Resource Name (ARN) for the private CA issues the certificate.
  ```
- If a `note` exists in `primary-identifiers`, append as `Note: …`.
- If multiple Pulumi tokens map to the CFN type, echo them all under `Pulumi types:` unless the user’s token disambiguates.

## Resolution logic

1. Load `primary-identifiers.json` once; build:
   - `byCfnType: Map<CFN, Entry>`
   - `byPulumiType: Map<Token, Entry[]>` (to handle multi-token CFN types).
2. Given `<type>`:
   - Try `byPulumiType` first; if multiple entries, pick the one whose `pulumiTypes` array contains the exact token. If still ambiguous (e.g., user passed CFN), fall back to CFN lookup.
   - If not found, return an error and suggest up to 5 close matches (simple case-insensitive substring/Levenshtein over pulumiTypes + CFN keys).
3. The identifier format shown to the user is `format` with each part wrapped in `{}` and separators preserved (e.g., `arn/certificateAuthorityArn` → `{arn}/{certificateAuthorityArn}`).

## Part annotation (text output)

- For aws-native:
  - Look up metadata entry using the selected Pulumi token; if missing, try the CFN type’s token.
  - For each part:
    - Classification: `Input` if present in `inputs`; otherwise `Output` if present in `outputs`; otherwise `Unknown`.
    - Description: use the description from the chosen source; if both input and output exist, prefer the input description (matches the example expectation). If absent, say `No description available in aws-native metadata`.
- For aws (classic):
  - No shipped property metadata; show classification as `Segment` and no description unless we can pull from `aws-import-docs`:
    - If an `importDoc` entry exists, append a one-line “Import doc:” with the raw string to give the user context.
- Always include the raw `primaryIdentifier.parts` list for `--json` consumers.

## JSON output shape

```json
{
  "cfnType": "AWS::ACMPCA::Certificate",
  "provider": "aws-native",
  "pulumiTypes": ["aws-native:acmpca:Certificate"],
  "format": "{arn}/{certificateAuthorityArn}",
  "parts": [
    { "name": "arn", "source": "output", "description": "…" },
    { "name": "certificateAuthorityArn", "source": "input", "description": "…" }
  ],
  "note": "optional note from primary-identifiers",
  "importDoc": "optional string for aws classic"
}
```
- `source` is one of `input`, `output`, `unknown`, or `segment` (for aws classic).

## Implementation plan

- Add a new CLI subcommand `ids` in `src/cli/cli-runner.ts`:
  - Extend `ParsedCliCommand` and argument parsing to recognize `ids <type> [--json]`; error on unknown flags.
  - Dispatch to a new module, e.g., `src/cli/identifier-help.ts`, for lookup and rendering; keep CLI surface minimal (no required assembly).
- `identifier-help.ts` responsibilities:
  - Load and index schema files (paths relative to compiled `lib/cli`).
  - Implement the resolution and part-annotation logic above.
  - Provide both text renderer (for stdout) and JSON-returning variant (for tests and `--json`).
- Wire the new command into `runCli` with appropriate exit codes.
- Documentation: add a short section to `README.md` describing the new command and example output.

## Edge cases to handle

- Type not found → exit code 1 with a helpful message plus suggestions.
- CFN type provided instead of Pulumi token should still work.
- Multi-token CFN types (e.g., FSx) should list all Pulumi tokens unless the user passed an exact token.
- Missing metadata for a part should not crash; fall back to `Unknown` and placeholder description.
- Notes in `primary-identifiers.json` should be surfaced.
- Ensure schema JSONs are bundled/copied with the binary so lookups work after packaging.

## Testing

- Unit tests in `test/cli/cli-runner.test.ts`:
  - Argument parsing for `ids`, `--json`, and error on missing `<type>`.
  - `runCli` dispatches and returns 0/1 as expected.
- Focused tests for `identifier-help.ts`:
  - aws-native happy path matches the sample output (classification prefers inputs when both exist).
  - aws classic path shows format and note/importDoc fallback.
  - Unknown type surfaces suggestions and non-zero exit.
  - JSON output includes raw parts, provider, pulumiTypes, and optional note/importDoc flags.
