import { ConstructTree } from '../assembly';
import { classifyConstructFqn } from './constructs';
import {
  ConstructKind,
  ConstructSummary,
  ConstructTotals,
  ConstructUsageSummary,
  PipelineUsageSummary,
  UserDefinedConstructSummary,
} from './types';

type MutableConstructTotals = {
  -readonly [K in keyof ConstructTotals]: ConstructTotals[K];
};

/**
 * Minimal per-stack information needed when summarizing construct usage.
 */
export interface StackConstructTree {
  readonly stackId: string;
  readonly tree: ConstructTree;
}

interface ConstructNodeInfo {
  readonly kind: ConstructKind;
  readonly path: string;
  readonly identifier: string;
  readonly displayFqn?: string;
  readonly sourceFqn?: string;
  readonly cloudFormationType?: string;
}

interface AggregateEntry {
  path: string;
  fqn?: string;
  kind: ConstructKind;
  count: number;
  stackIds: Set<string>;
}

/**
 * Builds the construct usage summary for the provided stack construct trees.
 */
export function summarizeConstructUsage(
  stacks: StackConstructTree[],
): ConstructUsageSummary {
  const totals = createEmptyTotals();
  const aggregates = new Map<string, AggregateEntry>();
  const userDefinedSummaries: UserDefinedConstructSummary[] = [];
  const userDefinedPaths = new Set<string>();
  const pipelines: PipelineUsageSummary[] = [];

  for (const stack of stacks) {
    traverseConstructTree(stack.tree, (node) => {
      const info = describeConstructNode(node);
      if (!info) {
        return;
      }

      incrementTotals(totals, info.kind);
      recordAggregate(aggregates, info, stack.stackId);

      if (info.kind === 'userDefined' && !userDefinedPaths.has(node.path)) {
        userDefinedPaths.add(node.path);
        userDefinedSummaries.push({
          path: node.path,
          children: summarizeUserDefinedChildren(node, stack.stackId),
        });
      }

      if (info.sourceFqn?.startsWith('aws-cdk-lib.pipelines.')) {
        pipelines.push({
          stackId: stack.stackId,
          constructPath: node.path,
          stages: extractPipelineStages(node),
        });
      }
    });
  }

  return {
    totals,
    constructs: finalizeAggregates(aggregates),
    userDefined: sortUserDefinedSummaries(userDefinedSummaries),
    pipelines: sortPipelineSummaries(pipelines),
  };
}

function traverseConstructTree(
  node: ConstructTree | undefined,
  visitor: (node: ConstructTree) => void,
) {
  if (!node) {
    return;
  }
  visitor(node);
  for (const child of Object.values(node.children ?? {})) {
    traverseConstructTree(child, visitor);
  }
}

function describeConstructNode(
  node: ConstructTree,
): ConstructNodeInfo | undefined {
  const sourceFqn = node.constructInfo?.fqn;
  const cloudFormationType = getCloudFormationType(node);
  if (!sourceFqn && !cloudFormationType) {
    return undefined;
  }

  let kind = classifyConstructFqn(sourceFqn);
  if (cloudFormationType) {
    if (isCustomResourceCloudFormationType(cloudFormationType)) {
      kind = 'customResource';
    } else if (kind === 'unknown') {
      kind = 'l1';
    }
  }

  const identifier = buildIdentifier(
    kind,
    sourceFqn,
    cloudFormationType,
    node.path,
  );
  const displayFqn = cloudFormationType ?? sourceFqn;

  return {
    kind,
    path: node.path,
    identifier,
    displayFqn,
    sourceFqn,
    cloudFormationType,
  };
}

function buildIdentifier(
  kind: ConstructKind,
  sourceFqn: string | undefined,
  cloudFormationType: string | undefined,
  path: string,
): string {
  switch (kind) {
    case 'coreL2':
    case 'userDefined':
    case 'thirdParty':
      return sourceFqn ?? path;
    case 'l1':
      return cloudFormationType ?? sourceFqn ?? path;
    case 'customResource':
      return cloudFormationType ?? sourceFqn ?? path;
    default:
      return path;
  }
}

function recordAggregate(
  map: Map<string, AggregateEntry>,
  info: ConstructNodeInfo,
  stackId: string,
) {
  const key = `${info.kind}:${info.identifier}`;
  const current = map.get(key);
  if (current) {
    current.count += 1;
    current.stackIds.add(stackId);
    return;
  }

  map.set(key, {
    path: info.path,
    fqn: info.displayFqn,
    kind: info.kind,
    count: 1,
    stackIds: new Set([stackId]),
  });
}

function finalizeAggregates(
  map: Map<string, AggregateEntry>,
): ConstructSummary[] {
  return Array.from(map.values())
    .map<ConstructSummary>((entry) => ({
      path: entry.path,
      fqn: entry.fqn,
      kind: entry.kind,
      count: entry.count,
      stackId:
        entry.stackIds.size === 1 ? Array.from(entry.stackIds)[0] : undefined,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.path.localeCompare(b.path);
    });
}

function summarizeUserDefinedChildren(
  node: ConstructTree,
  stackId: string,
): ConstructSummary[] {
  const summaries: ConstructSummary[] = [];
  for (const child of Object.values(node.children ?? {})) {
    const childInfo = describeConstructNode(child);
    summaries.push({
      path: child.path,
      fqn: childInfo?.displayFqn,
      kind: childInfo?.kind ?? 'unknown',
      count: countNodes(child),
      stackId,
    });
  }
  return summaries.sort((a, b) => a.path.localeCompare(b.path));
}

function extractPipelineStages(node: ConstructTree): string[] {
  const stageNames = new Set<string>();
  for (const child of Object.values(node.children ?? {})) {
    stageNames.add(child.id);
  }
  return Array.from(stageNames).sort((a, b) => a.localeCompare(b));
}

function sortUserDefinedSummaries(
  summaries: UserDefinedConstructSummary[],
): UserDefinedConstructSummary[] {
  return summaries
    .map((summary) => ({
      ...summary,
      children: summary.children
        .slice()
        .sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function sortPipelineSummaries(
  summaries: PipelineUsageSummary[],
): PipelineUsageSummary[] {
  return summaries
    .map((summary) => ({
      ...summary,
      stages: summary.stages
        ? summary.stages.slice().sort((a, b) => a.localeCompare(b))
        : [],
    }))
    .sort((a, b) => a.constructPath.localeCompare(b.constructPath));
}

function createEmptyTotals(): MutableConstructTotals {
  return {
    coreL2: 0,
    l1: 0,
    customResources: 0,
    userDefined: 0,
    thirdParty: 0,
    unknown: 0,
  };
}

function incrementTotals(totals: MutableConstructTotals, kind: ConstructKind) {
  switch (kind) {
    case 'coreL2':
      totals.coreL2 += 1;
      break;
    case 'l1':
      totals.l1 += 1;
      break;
    case 'customResource':
      totals.customResources += 1;
      break;
    case 'userDefined':
      totals.userDefined += 1;
      break;
    case 'thirdParty':
      totals.thirdParty += 1;
      break;
    default:
      totals.unknown += 1;
      break;
  }
}

function getCloudFormationType(node: ConstructTree): string | undefined {
  const type = node.attributes?.['aws:cdk:cloudformation:type'];
  return typeof type === 'string' ? type : undefined;
}

function isCustomResourceCloudFormationType(type: string): boolean {
  return (
    type.startsWith('Custom::') ||
    type === 'AWS::CloudFormation::CustomResource'
  );
}

function countNodes(node: ConstructTree | undefined): number {
  if (!node) {
    return 0;
  }
  const children = Object.values(node.children ?? {});
  return 1 + children.reduce((total, child) => total + countNodes(child), 0);
}
