/**
 * Schema version emitted when generating an {@link AnalysisReport}.
 *
 * Keeping this constant in one location makes it easy to bump whenever the
 * report structure changes in a backwards incompatible manner.
 */
export const ANALYSIS_REPORT_VERSION = '1.1.0';

/**
 * Top level data structure returned by the CDK assembly analyzer.
 */
export interface AnalysisReport {
  /** Metadata about the generation process */
  readonly metadata: AnalysisReportMetadata;

  /** Overview of the CDK application */
  readonly app: AppSummary;

  /** Normalized environment targets referenced by the assembly */
  readonly environments: EnvironmentSummary[];

  /** Aggregate view of constructs referenced across stacks */
  readonly constructs: ConstructUsageSummary;

  /** CloudFormation resource inventory */
  readonly resources: ResourceInventorySummary;

  /** Asset, custom resource, and Lambda specific insights */
  readonly assets: AssetUsageSummary;

  /** Optional notes or warnings surfaced during analysis */
  readonly notes?: string[];
}

/**
 * Generator level metadata captured in each report.
 */
export interface AnalysisReportMetadata {
  /** Semantic version of the report schema */
  readonly schemaVersion: string;

  /** ISO timestamp describing when the report was produced */
  readonly generatedAt: string;

  /** Absolute path to the analyzed assembly directory */
  readonly assemblyDirectory: string;

  /** Optional identifier for the specific stage / nested assembly */
  readonly stage?: string;

  /** Version or git SHA of the converter producing the report */
  readonly analyzerVersion?: string;
}

/**
 * Application level overview.
 */
export interface AppSummary {
  /** Result of the language detection heuristics */
  readonly language: LanguageDetectionResult;

  /** Whether the assembly leverages stages */
  readonly stageUsage: StageUsageSummary;

  /** List of detected stages (if any) */
  readonly stages: StageSummary[];

  /** Flat list of stack summaries for the analyzed assembly */
  readonly stacks: StackSummary[];
}

export interface StageUsageSummary {
  readonly usesStages: boolean;
  readonly stageCount: number;
  readonly stackCount: number;
}

export interface StageSummary {
  readonly id: string;
  readonly displayName?: string;
  readonly path?: string;
  readonly environment?: EnvironmentTarget;
  readonly stacks: StackSummary[];
  readonly notes?: string[];
}

export interface StackSummary {
  /** Artifact / stack id */
  readonly id: string;

  /** Id rendered within the construct tree */
  readonly treeId: string;

  /** Absolute construct path */
  readonly path: string;

  /** Display name reported by the manifest */
  readonly displayName?: string;

  /** Account/region extracted from the manifest */
  readonly environment?: EnvironmentTarget;

  /** Total CloudFormation resources in the template + nested stacks */
  readonly resourceCount: number;

  /** Count of construct nodes underneath this stack root */
  readonly constructCount: number;

  /** Logical dependencies from the manifest */
  readonly dependencies: string[];

  /** Whether any resources in this stack refer to CDK assets */
  readonly usesAssets: boolean;

  /** Raw metadata extracted from the manifest (tags, parameters, etc.) */
  readonly metadata?: Record<string, unknown>;
}

export interface EnvironmentSummary {
  readonly id: string;
  readonly target: EnvironmentTarget;
  readonly stackIds: string[];
}

export interface EnvironmentTarget {
  readonly account?: string;
  readonly region?: string;
  readonly original?: string;
  readonly isUnknown?: boolean;
  readonly notes?: string[];
}

export interface LanguageDetectionResult {
  readonly language: AnalysisLanguage;
  readonly confidence: DetectionConfidence;
  readonly signals: LanguageDetectionSignal[];
  readonly notes?: string[];
}

export type AnalysisLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'csharp'
  | 'unknown';
export type DetectionConfidence = 'low' | 'medium' | 'high';

export interface LanguageDetectionSignal {
  readonly source: LanguageDetectionSource;
  readonly detail: string;
}

export type LanguageDetectionSource =
  | 'manifestRuntime'
  | 'library'
  | 'assetMetadata'
  | 'fallback';

export interface ConstructUsageSummary {
  readonly totals: ConstructTotals;
  readonly constructs: ConstructSummary[];
  readonly userDefined: UserDefinedConstructSummary[];
  readonly pipelines: PipelineUsageSummary[];
}

export interface ConstructTotals {
  readonly coreL2: number;
  readonly l1: number;
  readonly customResources: number;
  readonly userDefined: number;
  readonly thirdParty: number;
  readonly unknown: number;
}

export interface ConstructSummary {
  readonly path: string;
  readonly fqn?: string;
  readonly kind: ConstructKind;
  readonly count: number;
  readonly stackId?: string;
}

export type ConstructKind =
  | 'coreL2'
  | 'l1'
  | 'customResource'
  | 'userDefined'
  | 'thirdParty'
  | 'unknown';

export interface UserDefinedConstructSummary {
  readonly path: string;
  readonly children: ConstructSummary[];
}

export interface PipelineUsageSummary {
  readonly stackId: string;
  readonly constructPath: string;
  readonly stages?: string[];
}

export interface ResourceInventorySummary {
  readonly total: number;
  readonly byType: ResourceTypeSummary[];
}

export interface ResourceTypeSummary {
  readonly type: string;
  readonly count: number;
  readonly primaryIdentifier?: ResourcePrimaryIdentifierSummary;
  readonly resources: ResourceInstanceSummary[];
}

export interface ResourcePrimaryIdentifierSummary {
  readonly parts: string[];
  readonly format: string;
}

export interface ResourceInstanceSummary {
  readonly stackId: string;
  readonly logicalId: string;
  readonly path?: string;
  readonly usesAsset?: boolean;
}

export interface AssetUsageSummary {
  readonly total: number;
  readonly customResources: CustomResourceUsageSummary[];
  readonly lambdaFunctions: LambdaFunctionSummary[];
  readonly assets: AssetSummary[];
}

export interface CustomResourceUsageSummary {
  readonly type: string;
  readonly stackId: string;
  readonly logicalId: string;
  readonly serviceToken?: string;
  readonly handler?: string;
  readonly assetPath?: string;
}

export interface LambdaFunctionSummary {
  readonly stackId: string;
  readonly logicalId: string;
  readonly runtime?: string;
  readonly handler?: string;
  readonly constructPath?: string;
  readonly assetPath?: string;
}

export interface AssetSummary {
  readonly id: string;
  readonly stackId: string;
  readonly type: AssetType;
  readonly logicalId?: string;
  readonly path?: string;
  readonly packaging?: string;
}

export type AssetType = 'file' | 'docker' | 'unknown';
