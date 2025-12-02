import * as path from 'path';
import * as fs from 'fs-extra';
import * as YAML from 'yaml';
import { ProgramIR } from '../core';
import { ConversionReportBuilder } from './conversion-report';
import { postProcessProgramIr, PostProcessOptions } from './ir-post-processor';
import { serializeProgramIr } from './ir-to-yaml';
import { AssemblyAnalyzer } from '../core/analysis';
import {
  AssemblyManifestReader,
  convertAssemblyDirectoryToProgramIr,
  convertStageInAssemblyDirectoryToProgramIr,
} from '../core/assembly';

export const DEFAULT_OUTPUT_FILE = 'Pulumi.yaml';

export interface ConvertCliOptions {
  assemblyDir: string;
  outFile: string;
  skipCustomResources: boolean;
  stackFilters: string[];
  stage?: string;
  reportFile?: string;
}

export interface AnalyzeCliOptions {
  assemblyDir: string;
  stage?: string;
  format: 'json' | 'yaml';
  outputFile?: string;
}

export type ParsedCliCommand =
  | { command: 'convert'; options: ConvertCliOptions }
  | { command: 'analyze'; options: AnalyzeCliOptions };

class CliError extends Error {}

export function parseArguments(argv: string[]): ParsedCliCommand {
  if (argv.length === 0) {
    throw new CliError(usage());
  }

  const { command, args } = extractCommand(argv);
  if (command === 'analyze') {
    return { command, options: parseAnalyzeArguments(args) };
  }
  return { command: 'convert', options: parseConvertArguments(args) };
}

function extractCommand(argv: string[]): {
  command: 'convert' | 'analyze';
  args: string[];
} {
  if (argv.length === 0) {
    return { command: 'convert', args: [] };
  }
  const candidate = argv[0];
  if (candidate === 'convert') {
    return { command: 'convert', args: argv.slice(1) };
  }
  if (candidate === 'analyze') {
    return { command: 'analyze', args: argv.slice(1) };
  }
  if (candidate.startsWith('--')) {
    return { command: 'convert', args: argv };
  }
  throw new CliError(`Unknown command: ${candidate}\n${usage()}`);
}

function parseConvertArguments(argv: string[]): ConvertCliOptions {
  let assemblyDir: string | undefined;
  let outFile: string | undefined;
  let skipCustomResources = false;
  const stackFilters: string[] = [];
  let stage: string | undefined;
  let reportFile: string | undefined;
  let disableReport = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--assembly':
        assemblyDir = requireValue(arg, argv[++i]);
        break;
      case '--out':
        outFile = requireValue(arg, argv[++i]);
        break;
      case '--skip-custom':
        skipCustomResources = true;
        break;
      case '--stacks': {
        const value = requireValue(arg, argv[++i]);
        stackFilters.push(...parseList(value));
        break;
      }
      case '--stage':
        stage = requireValue(arg, argv[++i]);
        break;
      case '--report':
        reportFile = requireValue(arg, argv[++i]);
        break;
      case '--no-report':
        disableReport = true;
        break;
      case '--help':
      case '-h':
        throw new CliError(usage());
      default:
        throw new CliError(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  if (!assemblyDir) {
    throw new CliError(`Missing required option --assembly\n${usage()}`);
  }

  if (disableReport && reportFile) {
    throw new CliError('Cannot specify --report when --no-report is provided');
  }

  const targetOutFile = outFile ?? DEFAULT_OUTPUT_FILE;
  const resolvedReport = disableReport
    ? undefined
    : (reportFile ?? `${targetOutFile}.report.json`);

  return {
    assemblyDir,
    outFile: targetOutFile,
    skipCustomResources,
    stackFilters,
    stage,
    reportFile: resolvedReport,
  };
}

function parseAnalyzeArguments(argv: string[]): AnalyzeCliOptions {
  let assemblyDir: string | undefined;
  let stage: string | undefined;
  let format: 'json' | 'yaml' = 'json';
  let outputFile: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--assembly':
        assemblyDir = requireValue(arg, argv[++i]);
        break;
      case '--stage':
        stage = requireValue(arg, argv[++i]);
        break;
      case '--format': {
        const value = requireValue(arg, argv[++i]).toLowerCase();
        if (value !== 'json' && value !== 'yaml') {
          throw new CliError(
            `Invalid format '${value}'. Expected json or yaml.`,
          );
        }
        format = value;
        break;
      }
      case '--output':
        outputFile = requireValue(arg, argv[++i]);
        break;
      case '--help':
      case '-h':
        throw new CliError(usage());
      default:
        throw new CliError(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  if (!assemblyDir) {
    throw new CliError(`Missing required option --assembly\n${usage()}`);
  }

  return { assemblyDir, stage, format, outputFile };
}

export function runCliWithOptions(options: ConvertCliOptions): void {
  const reportBuilder = options.reportFile
    ? new ConversionReportBuilder()
    : undefined;
  const program = loadProgramIr(
    options.assemblyDir,
    {
      skipCustomResources: options.skipCustomResources,
      reportCollector: reportBuilder,
    },
    options.stackFilters,
    options.stage,
  );
  const yaml = serializeProgramIr(program, {
    externalConfigCollector: reportBuilder,
  });
  const targetDir = path.dirname(options.outFile);
  fs.ensureDirSync(targetDir);
  fs.writeFileSync(options.outFile, yaml);
  if (options.reportFile && reportBuilder) {
    const reportDir = path.dirname(options.reportFile);
    fs.ensureDirSync(reportDir);
    fs.writeFileSync(
      options.reportFile,
      JSON.stringify(reportBuilder.build(), null, 2),
    );
  }
}

export function runAnalyzeWithOptions(
  options: AnalyzeCliOptions,
  logger: Pick<Console, 'log'> = console,
): void {
  const analyzer = new AssemblyAnalyzer();
  const report = analyzer.analyze({
    assemblyDirectory: options.assemblyDir,
    stage: options.stage,
  });
  const serialized =
    options.format === 'yaml'
      ? YAML.stringify(report)
      : JSON.stringify(report, null, 2);
  if (options.outputFile) {
    const dir = path.dirname(options.outputFile);
    fs.ensureDirSync(dir);
    fs.writeFileSync(options.outputFile, serialized);
    logger.log(`Wrote analysis report to ${options.outputFile}`);
    return;
  }
  logger.log(serialized);
}

export function runCli(
  argv: string[],
  logger: Pick<Console, 'log' | 'error'> = console,
): number {
  try {
    const parsed = parseArguments(argv);
    if (parsed.command === 'convert') {
      const resolved: ConvertCliOptions = {
        assemblyDir: path.resolve(parsed.options.assemblyDir),
        outFile: path.resolve(parsed.options.outFile),
        skipCustomResources: parsed.options.skipCustomResources,
        stackFilters: parsed.options.stackFilters,
        stage: parsed.options.stage,
        reportFile: parsed.options.reportFile
          ? path.resolve(parsed.options.reportFile)
          : undefined,
      };
      runCliWithOptions(resolved);
      logger.log(`Wrote Pulumi YAML to ${resolved.outFile}`);
    } else {
      const resolved: AnalyzeCliOptions = {
        assemblyDir: path.resolve(parsed.options.assemblyDir),
        stage: parsed.options.stage,
        format: parsed.options.format,
        outputFile: parsed.options.outputFile
          ? path.resolve(parsed.options.outputFile)
          : undefined,
      };
      runAnalyzeWithOptions(resolved, logger);
    }
    return 0;
  } catch (err) {
    if (err instanceof CliError) {
      logger.error(err.message);
    } else if (err instanceof Error) {
      logger.error(err.message);
    } else {
      logger.error(err);
    }
    return 1;
  }
}

export function main(argv = process.argv.slice(2)) {
  const code = runCli(argv, console);
  if (code !== 0) {
    process.exit(code);
  }
}

function loadProgramIr(
  assemblyDir: string,
  options?: PostProcessOptions,
  stackFilters?: string[],
  stage?: string,
): ProgramIR {
  const stackFilterSet =
    stackFilters && stackFilters.length > 0 ? new Set(stackFilters) : undefined;
  const program = stage
    ? convertStageInAssemblyDirectoryToProgramIr(
        assemblyDir,
        stage,
        stackFilterSet,
      )
    : convertAssemblyDirectoryToProgramIr(assemblyDir, stackFilterSet);
  const filtered = filterProgramStacks(program, stackFilters);
  const bootstrapBucketName =
    options?.bootstrapBucketName ??
    discoverBootstrapBucketName(assemblyDir, stage);
  return postProcessProgramIr(filtered, {
    ...options,
    bootstrapBucketName,
  });
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) {
    throw new CliError(`Missing value for ${flag}`);
  }
  return value;
}

function usage(): string {
  return `Usage:\n  cdk-to-pulumi [convert] --assembly <cdk.out> [--stage <name>] [--out <pulumi.yaml>] [--skip-custom] [--stacks <name1,name2>] [--report <path>] [--no-report]\n  cdk-to-pulumi analyze --assembly <cdk.out> [--stage <name>] [--format json|yaml] [--output <file>]`;
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function filterProgramStacks(
  program: ProgramIR,
  stackFilters?: string[],
): ProgramIR {
  if (!stackFilters || stackFilters.length === 0) {
    return program;
  }
  const requested = new Set(stackFilters);
  const stacks = program.stacks.filter((stack) => requested.has(stack.stackId));
  const matched = new Set(stacks.map((stack) => stack.stackId));
  const missing = stackFilters.filter((name) => !matched.has(name));
  if (missing.length > 0) {
    throw new CliError(`Unknown stack(s): ${missing.join(', ')}`);
  }
  return { ...program, stacks };
}

function discoverBootstrapBucketName(
  assemblyDir: string,
  stage?: string,
): string | undefined {
  try {
    const reader = AssemblyManifestReader.fromDirectory(assemblyDir);
    const bucketFromRoot = findBootstrapBucketNameInManifest(reader);
    if (bucketFromRoot) {
      return bucketFromRoot;
    }

    if (!stage) {
      return undefined;
    }

    try {
      const nested = reader.loadNestedAssembly(stage);
      return findBootstrapBucketNameInManifest(nested);
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

function findBootstrapBucketNameInManifest(
  reader: AssemblyManifestReader,
): string | undefined {
  for (const artifact of Object.values(reader.artifacts)) {
    if (artifact.type !== 'cdk:asset-manifest') {
      continue;
    }
    const props = artifact.properties as any;
    const manifestFile = props?.file;
    if (!manifestFile) {
      continue;
    }
    const manifestPath = path.join(reader.directory, manifestFile);
    try {
      const manifest = fs.readJSONSync(manifestPath) as any;
      const files = manifest.files ?? {};
      for (const entry of Object.values<any>(files)) {
        const destinations = entry?.destinations ?? {};
        for (const dest of Object.values<any>(destinations)) {
          const bucketName = dest?.bucketName;
          if (typeof bucketName === 'string' && bucketName.length > 0) {
            return bucketName;
          }
        }
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

if (require.main === module) {
  main();
}
