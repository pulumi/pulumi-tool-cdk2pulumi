// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const awsImportDocs = require('../../schemas/aws-import-docs.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const pulumiMetadata = require('../../schemas/aws-native-metadata.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const primaryIdentifiers = require('../../schemas/primary-identifiers.json');

type Provider = 'aws' | 'aws-native';

type PrimaryIdentifierEntryOrList =
  | PrimaryIdentifierEntry
  | PrimaryIdentifierEntry[];

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
  irreversibleNames?: Record<string, string>;
  listHandlerSchema?: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
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
  listHandlerRequiredProperties?: string[];
}

export class IdLookupError extends Error {
  constructor(
    message: string,
    public readonly suggestions?: string[],
  ) {
    super(message);
  }
}

// Lazy-loaded caches to keep startup fast for other commands.
let primaryIdentifiersCache:
  | {
      byCfn: Map<string, PrimaryIdentifierEntry[]>;
      byPulumi: Map<
        string,
        Array<{ cfnType: string; entry: PrimaryIdentifierEntry }>
      >;
    }
  | undefined;

function normalizeEntries(
  entryOrList: PrimaryIdentifierEntryOrList,
): PrimaryIdentifierEntry[] {
  return Array.isArray(entryOrList) ? entryOrList : [entryOrList];
}

function loadPrimaryIdentifiers() {
  if (primaryIdentifiersCache) {
    return primaryIdentifiersCache;
  }
  const raw: Record<string, PrimaryIdentifierEntryOrList> = primaryIdentifiers;
  const byCfn = new Map<string, PrimaryIdentifierEntry[]>();
  const byPulumi = new Map<
    string,
    Array<{ cfnType: string; entry: PrimaryIdentifierEntry }>
  >();

  for (const [cfnType, entryOrList] of Object.entries(raw)) {
    const entries = normalizeEntries(entryOrList);
    byCfn.set(cfnType, entries);
    for (const entry of entries) {
      for (const token of entry.pulumiTypes ?? []) {
        const list = byPulumi.get(token) ?? [];
        list.push({ cfnType, entry });
        byPulumi.set(token, list);
      }
    }
  }

  primaryIdentifiersCache = { byCfn, byPulumi };
  return primaryIdentifiersCache;
}

function loadAwsNativeMetadata(): {
  resources: Record<string, AwsNativeResourceMetadata>;
} {
  return pulumiMetadata;
}

function loadAwsImportDocs(): Record<string, AwsImportDocEntry> {
  return awsImportDocs;
}

export function lookupIdentifier(type: string): IdentifierInfo[] {
  const { byCfn, byPulumi } = loadPrimaryIdentifiers();

  const infos: IdentifierInfo[] = [];

  const pulumiMatches = byPulumi.get(type);
  if (pulumiMatches && pulumiMatches.length > 0) {
    for (const match of pulumiMatches) {
      infos.push(buildIdentifierInfo(match.entry, match.cfnType, type));
    }
    return infos;
  }

  const cfnMatches = byCfn.get(type);
  if (cfnMatches && cfnMatches.length > 0) {
    for (const entry of cfnMatches) {
      infos.push(buildIdentifierInfo(entry, type));
    }
    return infos;
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
    listHandlerRequiredProperties:
      entry.provider === 'aws-native'
        ? resolveListHandlerRequired(chosenPulumiType)
        : undefined,
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
  const irreversible = metadata?.irreversibleNames ?? {};

  return parts.map((name) => {
    const resolvedName =
      name in inputs || name in outputs
        ? name
        : resolveIrreversibleName(name, irreversible);
    const inputMeta = inputs[resolvedName];
    const outputMeta = outputs[resolvedName];
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

function resolveIrreversibleName(
  original: string,
  irreversible: Record<string, string>,
): string {
  const target = Object.entries(irreversible).find(
    ([, cfName]) => cfName.toLowerCase() === original.toLowerCase(),
  );
  return target ? target[0] : original;
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
  const ordered = [...parts].sort((a, b) => b.length - a.length);
  for (const part of ordered) {
    decorated = decorated.split(part).join(`{${part}}`);
  }
  return decorated;
}

function suggestTypes(
  query: string,
  byCfn: Map<string, PrimaryIdentifierEntry[]>,
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

export function renderIdentifiers(
  infos: IdentifierInfo[],
  requestedType?: string,
): string {
  return infos
    .map((info) => renderIdentifier(info, requestedType))
    .join('\n\n');
}

function renderIdentifier(
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
  lines.push(renderFindingIdHint(info));
  return lines.join('\n');
}

function renderFindingIdHint(info: IdentifierInfo): string {
  if (info.parts.length <= 1) {
    return 'Finding the ID: Try the CloudFormation PhysicalResourceId';
  }

  const baseCommand = `aws cloudcontrol list-resources --type-name ${info.cfnType}`;
  const required = info.listHandlerRequiredProperties;
  if (!required || required.length === 0) {
    return `Finding the ID: ${baseCommand}`;
  }

  const model = required.map((name) => `"${name}": "<VALUE>"`).join(', ');
  return `Finding the ID: ${baseCommand} --resource-model '{${model}}'`;
}

function resolveListHandlerRequired(pulumiType: string): string[] | undefined {
  const metadata = loadAwsNativeMetadata().resources[pulumiType];
  const required = metadata?.listHandlerSchema?.required;
  if (!required || required.length === 0) {
    return undefined;
  }
  return required;
}
