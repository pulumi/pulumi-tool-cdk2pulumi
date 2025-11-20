import * as fs from 'fs';
import * as path from 'path';

interface PulumiResource {
  cf?: string;
  primaryIdentifier?: string[];
}

interface PulumiMetadata {
  resources: { [key: string]: PulumiResource };
}

interface PrimaryIdentifierInfo {
  provider: 'aws' | 'aws-native';
  primaryIdentifier: {
    parts: string[];
    format: string;
  };
}

const metadataPath = path.resolve(
  __dirname,
  './schemas/aws-native-metadata.json',
);
const metadata: PulumiMetadata = JSON.parse(
  fs.readFileSync(metadataPath, 'utf-8'),
);

const awsPrimaryIdsPath = path.resolve(
  __dirname,
  './schemas/aws-primary-ids.json',
);
const awsPrimaryIds: Record<string, PrimaryIdentifierInfo> = JSON.parse(
  fs.readFileSync(awsPrimaryIdsPath, 'utf-8'),
);

const primaryIdentifiers: { [cfnType: string]: PrimaryIdentifierInfo } = {};

for (const pulumiType in metadata.resources) {
  const resource = metadata.resources[pulumiType];
  if (
    resource.cf &&
    resource.primaryIdentifier &&
    resource.primaryIdentifier.length > 0
  ) {
    const cfnType = resource.cf;
    primaryIdentifiers[cfnType] = {
      provider: 'aws-native',
      primaryIdentifier: {
        parts: resource.primaryIdentifier,
        format: resource.primaryIdentifier.join('|'),
      },
    };
  }
}

const unsupportedTypesPath = path.resolve(
  __dirname,
  './schemas/unsupported-types.txt',
);
const unsupportedTypes = fs
  .readFileSync(unsupportedTypesPath, 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

for (const cfnType of unsupportedTypes) {
  const fromAwsIds = awsPrimaryIds[cfnType];

  if (primaryIdentifiers[cfnType]) {
    continue;
  }

  primaryIdentifiers[cfnType] = {
    provider: fromAwsIds?.provider ?? 'aws',
    primaryIdentifier: fromAwsIds?.primaryIdentifier ?? {
      parts: [],
      format: '',
    },
  };
}

const outputPath = path.resolve(
  __dirname,
  './schemas/primary-identifiers.json',
);
fs.writeFileSync(outputPath, JSON.stringify(primaryIdentifiers, null, 2));

console.log(`Primary identifiers extracted to ${outputPath}`);
