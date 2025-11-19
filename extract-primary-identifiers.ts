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
      primaryIdentifier: {
        parts: resource.primaryIdentifier,
        format: resource.primaryIdentifier.join('|'),
      },
    };
  }
}

const outputPath = path.resolve(__dirname, './primary-identifiers.json');
fs.writeFileSync(outputPath, JSON.stringify(primaryIdentifiers, null, 2));

console.log(`Primary identifiers extracted to ${outputPath}`);
