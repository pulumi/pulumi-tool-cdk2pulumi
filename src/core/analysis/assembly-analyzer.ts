import {
  ArtifactManifest,
  ArtifactType,
} from 'aws-cdk-lib/cloud-assembly-schema';
import {
  AssemblyManifestReader,
  ConstructTree,
  StackManifest,
} from '../assembly';
import { summarizeConstructUsage } from './construct-tree';
import { parseEnvironmentTarget, summarizeEnvironments } from './environment';
import {
  resourceUsesAsset,
  summarizeResourceInventory,
} from './resource-inventory';
import {
  ANALYSIS_REPORT_VERSION,
  AnalysisReport,
  AnalysisReportMetadata,
  AssetUsageSummary,
  StageSummary,
  StageUsageSummary,
  StackSummary,
} from './types';

export interface AssemblyAnalyzerInitOptions {
  readonly now?: () => Date;
  readonly analyzerVersion?: string;
}

export interface AnalyzeAssemblyOptions {
  readonly assemblyDirectory: string;
  readonly stage?: string;
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
    const manifest = targetReader.assemblyManifest;
    const stacks = targetReader.stackManifests;
    const stackSummaries = stacks.map((stack) =>
      this.buildStackSummary(stack, targetReader),
    );
    const stageSummaries = this.buildStageSummaries(targetReader);
    const stageUsage = this.buildStageUsage(stageSummaries, stackSummaries);

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
      resources: summarizeResourceInventory(stacks),
      assets: this.createEmptyAssetSummary(),
    };
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

  private createEmptyAssetSummary(): AssetUsageSummary {
    return {
      total: 0,
      customResources: [],
      lambdaFunctions: [],
      assets: [],
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
