import * as fs from 'fs';
import * as path from 'path';

type Provider = 'aws' | 'aws-native';

interface PrimaryIdentifierEntry {
  provider: Provider;
  primaryIdentifier: {
    parts: string[];
    format: string;
  };
  pulumiTypes: string[];
  note?: string;
}

interface AwsNativeResourceMetadata {
  inputs?: Record<string, { description?: string }>;
  outputs?: Record<string, { description?: string }>;
}

interface AwsImportDocEntry {
  importDoc?: string;
  awsType?: string;
}

export type PartSource = 'input' | 'output' | 'unknown' | 'segment';

export interface IdentifierPartInfo {
  name: string;
  source: PartSource;
  description?: string;
}

export interface IdentifierInfo {
  cfnType: string;
  provider: Provider;
  pulumiTypes: string[];
  format: string;
  parts: IdentifierPartInfo[];
  note?: string;
  importDoc?: string;
}

export class IdLookupError extends Error {
  constructor(
    message: string,
    public readonly suggestions?: string[],
  ) {
    super(message);
  }
}

const primaryIdentifiersPath = path.resolve(
  __dirname,
  '../../schemas/primary-identifiers.json',
);
const awsNativeMetadataPath = path.resolve(
  __dirname,
  '../../schemas/aws-native-metadata.json',
);
const awsImportDocsPath = path.resolve(
  __dirname,
  '../../schemas/aws-import-docs.json',
);

// Lazy-loaded caches to keep startup fast for other commands.
let primaryIdentifiersCache:
  | {
      byCfn: Map<string, PrimaryIdentifierEntry>;
      byPulumi: Map<
        string,
        Array<{ cfnType: string; entry: PrimaryIdentifierEntry }>
      >;
    }
  | undefined;
let awsNativeMetadataCache:
  | {
      resources: Record<string, AwsNativeResourceMetadata>;
    }
  | undefined;
let awsImportDocsCache: Record<string, AwsImportDocEntry> | undefined;

function loadPrimaryIdentifiers() {
  if (primaryIdentifiersCache) {
    return primaryIdentifiersCache;
  }
  const raw: Record<string, PrimaryIdentifierEntry> = JSON.parse(
    fs.readFileSync(primaryIdentifiersPath, 'utf-8'),
  );
  const byCfn = new Map<string, PrimaryIdentifierEntry>();
  const byPulumi = new Map<
    string,
    Array<{ cfnType: string; entry: PrimaryIdentifierEntry }>
  >();
  for (const [cfnType, entry] of Object.entries(raw)) {
    byCfn.set(cfnType, entry);
    for (const token of entry.pulumiTypes ?? []) {
      const list = byPulumi.get(token) ?? [];
      list.push({ cfnType, entry });
      byPulumi.set(token, list);
    }
  }
  primaryIdentifiersCache = { byCfn, byPulumi };
  return primaryIdentifiersCache;
}

function loadAwsNativeMetadata() {
  if (awsNativeMetadataCache) {
    return awsNativeMetadataCache;
  }
  awsNativeMetadataCache = JSON.parse(
    fs.readFileSync(awsNativeMetadataPath, 'utf-8'),
  );
  return awsNativeMetadataCache;
}

function loadAwsImportDocs() {
  if (awsImportDocsCache) {
    return awsImportDocsCache;
  }
  try {
    awsImportDocsCache = JSON.parse(
      fs.readFileSync(awsImportDocsPath, 'utf-8'),
    );
  } catch {
    awsImportDocsCache = {};
  }
  return awsImportDocsCache;
}

export function lookupIdentifier(type: string): IdentifierInfo {
  const { byCfn, byPulumi } = loadPrimaryIdentifiers();

  const pulumiMatches = byPulumi.get(type);
  if (pulumiMatches && pulumiMatches.length > 0) {
    // Prefer entries that explicitly list the provided token.
    const chosen = pulumiMatches[0];
    return buildIdentifierInfo(chosen.entry, chosen.cfnType, type);
  }

  const cfnMatch = byCfn.get(type);
  if (cfnMatch) {
    return buildIdentifierInfo(cfnMatch, type);
  }

  const suggestions = suggestTypes(type, byCfn, byPulumi);
  throw new IdLookupError(`Unknown resource type: ${type}`, suggestions);
}

function buildIdentifierInfo(
  entry: PrimaryIdentifierEntry,
  cfnType: string,
  pulumiType?: string,
): IdentifierInfo {
  const chosenPulumiType = pulumiType ?? entry.pulumiTypes[0];
  const formatDecorated = decorateFormat(
    entry.primaryIdentifier.format,
    entry.primaryIdentifier.parts,
  );
  const parts =
    entry.provider === 'aws-native'
      ? annotateAwsNativeParts(entry.primaryIdentifier.parts, chosenPulumiType)
      : annotateAwsClassicParts(entry.primaryIdentifier.parts);

  const importDoc =
    entry.provider === 'aws'
      ? loadAwsImportDocs()[cfnType]?.importDoc
      : undefined;

  return {
    cfnType,
    provider: entry.provider,
    pulumiTypes: entry.pulumiTypes,
    format: formatDecorated,
    parts,
    ...(entry.note ? { note: entry.note } : {}),
    ...(importDoc ? { importDoc } : {}),
  };
}

function annotateAwsNativeParts(
  parts: string[],
  pulumiType: string,
): IdentifierPartInfo[] {
  const metadata = loadAwsNativeMetadata().resources[pulumiType];
  const inputs = metadata?.inputs ?? {};
  const outputs = metadata?.outputs ?? {};

  return parts.map((name) => {
    const inputMeta = inputs[name];
    const outputMeta = outputs[name];
    if (inputMeta) {
      return {
        name,
        source: 'input',
        description: inputMeta.description ?? outputMeta?.description,
      };
    }
    if (outputMeta) {
      return {
        name,
        source: 'output',
        description: outputMeta.description,
      };
    }
    return {
      name,
      source: 'unknown',
      description: undefined,
    };
  });
}

function annotateAwsClassicParts(parts: string[]): IdentifierPartInfo[] {
  return parts.map((name) => ({
    name,
    source: 'segment',
    description: undefined,
  }));
}

function decorateFormat(format: string, parts: string[]): string {
  let decorated = format;
  for (const part of parts) {
    decorated = decorated.split(part).join(`{${part}}`);
  }
  return decorated;
}

function suggestTypes(
  query: string,
  byCfn: Map<string, PrimaryIdentifierEntry>,
  byPulumi: Map<
    string,
    Array<{ cfnType: string; entry: PrimaryIdentifierEntry }>
  >,
): string[] {
  const haystack = [...byCfn.keys(), ...Array.from(byPulumi.keys())];
  const lowerQuery = query.toLowerCase();
  const scored = haystack.map((candidate) => ({
    candidate,
    score: distance(lowerQuery, candidate.toLowerCase()),
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored
    .filter((item) => item.score < Math.max(5, query.length))
    .slice(0, 5)
    .map((item) => item.candidate);
}

// Simple Levenshtein distance for suggestions; optimized for small strings.
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

export function renderIdentifier(
  info: IdentifierInfo,
  requestedType?: string,
): string {
  const lines: string[] = [];
  const pulumiLabel =
    requestedType && info.pulumiTypes.includes(requestedType)
      ? requestedType
      : info.pulumiTypes.join(', ');
  lines.push(
    `Resource: ${pulumiLabel} (CFN: ${info.cfnType}, provider: ${info.provider})`,
  );
  if (
    info.pulumiTypes.length > 1 &&
    !(requestedType && info.pulumiTypes.includes(requestedType))
  ) {
    lines.push(`Pulumi types: ${info.pulumiTypes.join(', ')}`);
  }
  lines.push(`Format: ${info.format}`);
  lines.push('Parts:');
  for (const part of info.parts) {
    const label =
      part.source === 'segment'
        ? 'Segment'
        : part.source.charAt(0).toUpperCase() + part.source.slice(1);
    const desc = part.description
      ? `: ${part.description}`
      : part.source === 'unknown'
        ? ': No description available in aws-native metadata'
        : '';
    lines.push(`  - ${part.name} (${label})${desc}`);
  }
  if (info.note) {
    lines.push(`Note: ${info.note}`);
  }
  if (info.importDoc) {
    lines.push(`Import doc: ${info.importDoc}`);
  }
  return lines.join('\n');
}
