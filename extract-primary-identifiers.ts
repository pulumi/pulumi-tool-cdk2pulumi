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
  awsTypes?: string[];
  pulumiTypes?: string[];
  note?: string;
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
const awsPrimaryIdsRaw: Record<
  string,
  PrimaryIdentifierInfo | PrimaryIdentifierInfo[]
> = JSON.parse(fs.readFileSync(awsPrimaryIdsPath, 'utf-8'));

function normalizeEntries(
  entries: PrimaryIdentifierInfo | PrimaryIdentifierInfo[] | undefined,
): PrimaryIdentifierInfo[] {
  if (!entries) {
    return [];
  }
  return Array.isArray(entries) ? entries : [entries];
}

const primaryIdentifiers: { [cfnType: string]: PrimaryIdentifierInfo[] } = {};

for (const pulumiType in metadata.resources) {
  const resource = metadata.resources[pulumiType];
  if (
    resource.cf &&
    resource.primaryIdentifier &&
    resource.primaryIdentifier.length > 0
  ) {
    const cfnType = resource.cf;
    primaryIdentifiers[cfnType] = [
      {
        provider: 'aws-native',
        primaryIdentifier: {
          parts: resource.primaryIdentifier,
          format: resource.primaryIdentifier.join('|'),
        },
        pulumiTypes: [pulumiType],
      },
    ];
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

const unsupportedSet = new Set(unsupportedTypes);

for (const cfnType of unsupportedTypes) {
  if (!awsPrimaryIdsRaw[cfnType]) {
    throw new Error(
      `Unsupported type ${cfnType} missing from aws-primary-ids.json`,
    );
  }
}

// Types where we intentionally overlay AWS Classic identifiers even though the
// resource is supported natively. These should not be forced into
// unsupported-types.txt, to avoid conflating "unsupported" with "overridden".
const overlayOverrides = new Set<string>([
  'AWS::RDS::DBProxyTargetGroup',
]);

for (const cfnType in awsPrimaryIdsRaw) {
  if (!unsupportedSet.has(cfnType) && !overlayOverrides.has(cfnType)) {
    throw new Error(
      `aws-primary-ids.json entry ${cfnType} missing from unsupported-types.txt`,
    );
  }
}

// Overlay manually maintained AWS identifiers, overriding any native entries.
for (const cfnType in awsPrimaryIdsRaw) {
  const entries = normalizeEntries(awsPrimaryIdsRaw[cfnType]);
  primaryIdentifiers[cfnType] = entries.map((fromAwsIds) => ({
    provider: fromAwsIds.provider ?? 'aws',
    primaryIdentifier: fromAwsIds.primaryIdentifier ??
      primaryIdentifiers[cfnType]?.[0]?.primaryIdentifier ?? {
        parts: [],
        format: '',
      },
    pulumiTypes:
      fromAwsIds.provider === 'aws-native'
        ? [cfnType.replace('AWS::', 'aws-native:').replace(/::/g, ':')]
        : (fromAwsIds.awsTypes ?? fromAwsIds.pulumiTypes ?? []),
    note: fromAwsIds.note,
  }));
}

// Validate completeness.
for (const [cfnType, entries] of Object.entries(primaryIdentifiers)) {
  if (!entries.length) {
    throw new Error(`Missing primary identifier for ${cfnType}`);
  }
  for (const info of entries) {
    if (
      !info.primaryIdentifier?.parts?.length ||
      !info.primaryIdentifier.format
    ) {
      throw new Error(`Missing primary identifier for ${cfnType}`);
    }
    if (!info.pulumiTypes || info.pulumiTypes.length === 0) {
      throw new Error(`Missing pulumiTypes for ${cfnType}`);
    }
    if (info.provider !== 'aws' && info.provider !== 'aws-native') {
      throw new Error(`Unknown provider for ${cfnType}`);
    }
  }
}

const outputPath = path.resolve(
  __dirname,
  './schemas/primary-identifiers.json',
);
const sortedOutput = Object.fromEntries(
  Object.keys(primaryIdentifiers)
    .sort()
    .map((key) => {
      const entries = primaryIdentifiers[key].map(
        ({ provider, primaryIdentifier, pulumiTypes, note }) => ({
          provider,
          primaryIdentifier,
          pulumiTypes,
          ...(note ? { note } : {}),
        }),
      );
      return [key, entries.length === 1 ? entries[0] : entries];
    }),
);

fs.writeFileSync(outputPath, JSON.stringify(sortedOutput, null, 2));

console.log(`Primary identifiers extracted to ${outputPath}`);
