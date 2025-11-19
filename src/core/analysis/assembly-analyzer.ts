import * as path from 'path';
import {
  ArtifactManifest,
  ArtifactType,
} from 'aws-cdk-lib/cloud-assembly-schema';
import {
  AssemblyManifestReader,
  ConstructTree,
  StackManifest,
} from '../assembly';
import { AssetLookup, loadAssetManifest } from './assets';
import { summarizeConstructUsage } from './construct-tree';
import { analyzeCustomResources } from './custom-resources';
import { parseEnvironmentTarget, summarizeEnvironments } from './environment';
import { analyzeLambdaFunctions } from './lambdas';
import {
  resourceUsesAsset,
  summarizeResourceInventory,
} from './resource-inventory';
import {
  ANALYSIS_REPORT_VERSION,
  AnalysisReport,
  AnalysisReportMetadata,
  AnalyzeAssemblyOptions,
  AssetSummary,
  AssetType,
  StageSummary,
  StageUsageSummary,
  StackSummary,
} from './types';

export interface AssemblyAnalyzerInitOptions {
  readonly now?: () => Date;
  readonly analyzerVersion?: string;
}

/**
 * High level orchestrator that ties together the manifest readers and the analyzer helpers.
 */
export class AssemblyAnalyzer {
  constructor(private readonly options: AssemblyAnalyzerInitOptions = {}) {}

  public analyze(options: AnalyzeAssemblyOptions): AnalysisReport {
    const rootReader = AssemblyManifestReader.fromDirectory(
      options.assemblyDirectory,
    );
    const targetReader = options.stage
      ? rootReader.loadNestedAssembly(options.stage)
      : rootReader;
    const stacks = targetReader.stackManifests;
    const assetLookup = this.loadAssets(options.assemblyDirectory);

    const stackSummaries = stacks.map((stack) =>
      this.buildStackSummary(stack, targetReader),
    );
    const stageSummaries = this.buildStageSummaries(targetReader);
    const stageUsage = this.buildStageUsage(stageSummaries, stackSummaries);
    const customResources = analyzeCustomResources(stacks, assetLookup);
    const lambdaFunctions = analyzeLambdaFunctions(stacks);

    // Aggregate unique assets from all sources
    const uniqueAssets = new Map<string, AssetSummary>();

    // Helper to add asset
    const addAsset = (
      id: string,
      type: AssetType,
      stackId: string,
      logicalId?: string,
      path?: string,
    ) => {
      if (!uniqueAssets.has(id)) {
        const details = assetLookup(id);
        uniqueAssets.set(id, {
          id,
          stackId,
          type,
          logicalId,
          path,
          packaging: details?.packaging,
        });
      }
    };

    // 1. From Resource Inventory
    const inventory = summarizeResourceInventory(stacks, assetLookup);
    for (const typeSummary of inventory.byType) {
      for (const resource of typeSummary.resources) {
        if (resource.asset) {
          addAsset(
            resource.asset.id,
            resource.asset.packaging === 'container' ? 'docker' : 'file',
            resource.stackId,
            resource.logicalId,
            resource.path,
          );
        }
      }
    }

    // 2. From Custom Resources
    for (const cr of customResources) {
      if (cr.assetPath) {
        const details = assetLookup(cr.assetPath);
        addAsset(
          cr.assetPath,
          details?.packaging === 'container' ? 'docker' : 'file',
          cr.stackId,
          cr.logicalId,
        );
      }
    }

    // 3. From Lambda Functions
    for (const lambda of lambdaFunctions) {
      if (lambda.assetPath) {
        const details = assetLookup(lambda.assetPath);
        addAsset(
          lambda.assetPath,
          details?.packaging === 'container' ? 'docker' : 'file',
          lambda.stackId,
          lambda.logicalId,
        );
      }
    }

    return {
      metadata: this.buildMetadata(options, targetReader.directory),
      app: {
        stageUsage,
        stages: stageSummaries,
        stacks: stackSummaries,
      },
      environments: summarizeEnvironments(stackSummaries),
      constructs: summarizeConstructUsage(
        stacks.map((stack) => ({
          stackId: stack.id,
          tree: stack.constructTree,
        })),
      ),
      resources: inventory,
      assets: {
        total: uniqueAssets.size,
        customResources,
        lambdaFunctions,
        assets: Array.from(uniqueAssets.values()),
      },
    };
  }

  private loadAssets(assemblyDirectory: string): AssetLookup {
    // Try to load asset manifest from the directory
    // In a real implementation we might look for specific artifact types
    // For now, assume standard location
    // Let's iterate artifacts to find type 'cdk:asset-manifest'
    const manifestReader =
      AssemblyManifestReader.fromDirectory(assemblyDirectory);
    for (const artifact of Object.values(manifestReader.artifacts)) {
      if (artifact.type === 'cdk:asset-manifest') {
        const props = artifact.properties as any;
        const file = props?.file;
        if (file) {
          return loadAssetManifest(path.join(assemblyDirectory, file));
        }
      }
    }

    return () => undefined;
  }

  private buildMetadata(
    options: AnalyzeAssemblyOptions,
    assemblyDirectory: string,
  ): AnalysisReportMetadata {
    return {
      schemaVersion: ANALYSIS_REPORT_VERSION,
      generatedAt: (this.options.now ?? (() => new Date()))().toISOString(),
      assemblyDirectory,
      stage: options.stage,
      analyzerVersion: this.options.analyzerVersion,
    };
  }

  private buildStageSummaries(reader: AssemblyManifestReader): StageSummary[] {
    const stages: StageSummary[] = [];
    for (const [artifactId, artifact] of Object.entries(reader.artifacts)) {
      if (artifact.type !== ArtifactType.NESTED_CLOUD_ASSEMBLY) {
        continue;
      }

      const notes: string[] = [];
      let stacks: StackSummary[] = [];
      let environment = undefined;
      try {
        const nestedReader = reader.loadNestedAssembly(artifactId);
        stacks = nestedReader.stackManifests.map((stack) =>
          this.buildStackSummary(stack, nestedReader),
        );
        environment = stacks[0]?.environment;
      } catch (error) {
        const message = error instanceof Error ? error.message : `${error}`;
        notes.push(
          `Failed to load nested assembly '${artifactId}': ${message}`,
        );
      }

      stages.push({
        id: artifactId,
        displayName: artifact.displayName ?? artifactId,
        path: artifactId,
        environment,
        stacks,
        notes: notes.length > 0 ? notes : undefined,
      });
    }
    return stages;
  }

  private buildStageUsage(
    stages: StageSummary[],
    stacks: StackSummary[],
  ): StageUsageSummary {
    return {
      usesStages: stages.length > 0,
      stageCount: stages.length,
      stackCount: stacks.length,
    };
  }

  private buildStackSummary(
    stack: StackManifest,
    reader: AssemblyManifestReader,
  ): StackSummary {
    const artifact = reader.getArtifact(stack.id);
    const environment = parseEnvironmentTarget(resolveEnvironment(artifact));
    const usesAssets = stackHasAssetMetadata(stack);

    return {
      id: stack.id,
      treeId: stack.constructTree.id,
      path: stack.constructTree.path,
      displayName: artifact?.displayName ?? stack.id,
      environment,
      resourceCount: countResources(stack),
      constructCount: countConstructNodes(stack.constructTree),
      dependencies: stack.dependencies,
      usesAssets,
    };
  }
}

function resolveEnvironment(artifact?: ArtifactManifest): string | undefined {
  if (!artifact) {
    return undefined;
  }
  if ('environment' in artifact && typeof artifact.environment === 'string') {
    return artifact.environment;
  }
  return undefined;
}

function stackHasAssetMetadata(stack: StackManifest): boolean {
  for (const template of Object.values(stack.stacks)) {
    for (const resource of Object.values(template.Resources ?? {})) {
      if (resourceUsesAsset(resource.Metadata)) {
        return true;
      }
    }
  }
  return false;
}

function countResources(stack: StackManifest): number {
  let total = 0;
  for (const template of Object.values(stack.stacks)) {
    total += Object.keys(template.Resources ?? {}).length;
  }
  return total;
}

function countConstructNodes(node: ConstructTree | undefined): number {
  if (!node) {
    return 0;
  }
  const children = Object.values(node.children ?? {});
  return (
    1 + children.reduce((sum, child) => sum + countConstructNodes(child), 0)
  );
}
