import { StackManifest } from '../assembly';
import { Metadata } from '../metadata';
import { PulumiProvider } from '../providers';
import {
  ResourcePrimaryIdentifierSummary,
  ResourceInstanceSummary,
  ResourceInventorySummary,
  ResourceTypeSummary,
} from './types';

interface MutableResourceTypeEntry {
  readonly type: string;
  count: number;
  resources: ResourceInstanceSummary[];
  primaryIdentifier?: ResourcePrimaryIdentifierSummary;
}

/**
 * Builds the CloudFormation resource inventory for the provided stack manifests.
 */
export function summarizeResourceInventory(
  stacks: StackManifest[],
): ResourceInventorySummary {
  const metadata = new Metadata(PulumiProvider.AWS_NATIVE);
  const aggregates = new Map<string, MutableResourceTypeEntry>();
  let total = 0;

  for (const stack of stacks) {
    for (const [stackPath, template] of Object.entries(stack.stacks)) {
      for (const [logicalId, resource] of Object.entries(
        template.Resources ?? {},
      )) {
        total += 1;
        const type = resource.Type ?? 'Unknown';
        const usesAsset = resourceUsesAsset(resource.Metadata);
        const path = deriveResourcePath(
          stackPath,
          logicalId,
          resource.Metadata,
        );

        const aggregate = getOrCreateAggregate(aggregates, type, metadata);
        aggregate.count += 1;
        aggregate.resources.push({
          stackId: stack.id,
          logicalId,
          path,
          usesAsset: usesAsset || undefined,
        });
      }
    }
  }

  return {
    total,
    byType: finalizeResourceAggregates(aggregates),
  };
}

function getOrCreateAggregate(
  map: Map<string, MutableResourceTypeEntry>,
  type: string,
  metadata: Metadata,
): MutableResourceTypeEntry {
  let aggregate = map.get(type);
  if (aggregate) {
    return aggregate;
  }
  aggregate = {
    type,
    count: 0,
    resources: [],
    primaryIdentifier: lookupPrimaryIdentifierSummary(metadata, type),
  };
  map.set(type, aggregate);
  return aggregate;
}

function finalizeResourceAggregates(
  map: Map<string, MutableResourceTypeEntry>,
): ResourceTypeSummary[] {
  return Array.from(map.values())
    .map<ResourceTypeSummary>((entry) => ({
      type: entry.type,
      count: entry.count,
      resources: sortResourceInstances(entry.resources),
      primaryIdentifier: entry.primaryIdentifier,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.type.localeCompare(b.type);
    });
}

function sortResourceInstances(
  instances: ResourceInstanceSummary[],
): ResourceInstanceSummary[] {
  return instances.sort((a, b) => {
    if (a.stackId !== b.stackId) {
      return a.stackId.localeCompare(b.stackId);
    }
    return a.logicalId.localeCompare(b.logicalId);
  });
}

function deriveResourcePath(
  stackPath: string,
  logicalId: string,
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  const metadataPath = metadata?.['aws:cdk:path'];
  if (typeof metadataPath === 'string' && metadataPath.length > 0) {
    return metadataPath;
  }
  if (stackPath && logicalId) {
    return `${stackPath}/${logicalId}`;
  }
  return logicalId || stackPath;
}

export function resourceUsesAsset(
  metadata: Record<string, unknown> | undefined,
): boolean {
  if (!metadata) {
    return false;
  }
  return Object.keys(metadata).some((key) => key.startsWith('aws:asset:'));
}

function lookupPrimaryIdentifierSummary(
  metadata: Metadata,
  cfnType: string,
): ResourcePrimaryIdentifierSummary | undefined {
  const parts = metadata.primaryIdentifier(cfnType);
  if (!parts || parts.length === 0) {
    return undefined;
  }
  return {
    parts,
    format: parts.join('|'),
  };
}
