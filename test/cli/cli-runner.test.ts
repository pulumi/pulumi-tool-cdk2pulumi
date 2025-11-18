import * as fs from 'fs-extra';
import {
  DEFAULT_OUTPUT_FILE,
  parseArguments,
  runCliWithOptions,
  runCli,
  runAnalyzeWithOptions,
} from '../../src/cli/cli-runner';
import { postProcessProgramIr } from '../../src/cli/ir-post-processor';
import { serializeProgramIr } from '../../src/cli/ir-to-yaml';
import { AssemblyAnalyzer } from '../../src/core/analysis';
import {
  convertAssemblyDirectoryToProgramIr,
  convertStageInAssemblyDirectoryToProgramIr,
} from '../../src/core/assembly';

jest.mock('../../src/core/assembly', () => ({
  convertAssemblyDirectoryToProgramIr: jest.fn(),
  convertStageInAssemblyDirectoryToProgramIr: jest.fn(),
}));

jest.mock('../../src/cli/ir-to-yaml', () => ({
  serializeProgramIr: jest.fn(),
}));

jest.mock('../../src/cli/ir-post-processor', () => ({
  postProcessProgramIr: jest.fn((program) => program),
}));

jest.mock('fs-extra', () => ({
  ensureDirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock('../../src/core/analysis', () => ({
  AssemblyAnalyzer: jest.fn(),
}));

const mockedConvert =
  convertAssemblyDirectoryToProgramIr as jest.MockedFunction<
    typeof convertAssemblyDirectoryToProgramIr
  >;
const mockedConvertStage =
  convertStageInAssemblyDirectoryToProgramIr as jest.MockedFunction<
    typeof convertStageInAssemblyDirectoryToProgramIr
  >;
const mockedSerialize = serializeProgramIr as jest.MockedFunction<
  typeof serializeProgramIr
>;
const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedPostProcess = postProcessProgramIr as jest.MockedFunction<
  typeof postProcessProgramIr
>;
const mockedAnalyzer = AssemblyAnalyzer as jest.MockedClass<
  typeof AssemblyAnalyzer
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedPostProcess.mockImplementation((program) => program);
  mockedAnalyzer.mockImplementation(
    () =>
      ({
        analyze: jest.fn().mockReturnValue(createMockAnalysisReport()),
      }) as any,
  );
});

describe('parseArguments', () => {
  test('returns defaults when only assembly provided', () => {
    expect(parseArguments(['--assembly', './cdk.out'])).toEqual({
      command: 'convert',
      options: {
        assemblyDir: './cdk.out',
        outFile: DEFAULT_OUTPUT_FILE,
        skipCustomResources: false,
        stackFilters: [],
        stage: undefined,
        reportFile: `${DEFAULT_OUTPUT_FILE}.report.json`,
      },
    });
  });

  test('throws on unknown flags', () => {
    expect(() => parseArguments(['--foo'])).toThrow(/Unknown argument/);
  });

  test('sets skipCustomResources when flag provided', () => {
    expect(
      parseArguments(['--assembly', './cdk.out', '--skip-custom']),
    ).toEqual({
      command: 'convert',
      options: {
        assemblyDir: './cdk.out',
        outFile: DEFAULT_OUTPUT_FILE,
        skipCustomResources: true,
        stackFilters: [],
        stage: undefined,
        reportFile: `${DEFAULT_OUTPUT_FILE}.report.json`,
      },
    });
  });

  test('parses stack filter list', () => {
    expect(
      parseArguments(['--assembly', './cdk.out', '--stacks', 'StackA,StackB']),
    ).toEqual({
      command: 'convert',
      options: {
        assemblyDir: './cdk.out',
        outFile: DEFAULT_OUTPUT_FILE,
        skipCustomResources: false,
        stackFilters: ['StackA', 'StackB'],
        stage: undefined,
        reportFile: `${DEFAULT_OUTPUT_FILE}.report.json`,
      },
    });
  });

  test('captures stage flag', () => {
    expect(
      parseArguments(['--assembly', './cdk.out', '--stage', 'DevStage']),
    ).toEqual({
      command: 'convert',
      options: {
        assemblyDir: './cdk.out',
        outFile: DEFAULT_OUTPUT_FILE,
        skipCustomResources: false,
        stackFilters: [],
        stage: 'DevStage',
        reportFile: `${DEFAULT_OUTPUT_FILE}.report.json`,
      },
    });
  });

  test('overrides report path', () => {
    expect(
      parseArguments([
        '--assembly',
        './cdk.out',
        '--out',
        'foo.yaml',
        '--report',
        'foo.json',
      ]),
    ).toEqual({
      command: 'convert',
      options: {
        assemblyDir: './cdk.out',
        outFile: 'foo.yaml',
        skipCustomResources: false,
        stackFilters: [],
        stage: undefined,
        reportFile: 'foo.json',
      },
    });
  });

  test('disables reports when requested', () => {
    expect(parseArguments(['--assembly', './cdk.out', '--no-report'])).toEqual({
      command: 'convert',
      options: {
        assemblyDir: './cdk.out',
        outFile: DEFAULT_OUTPUT_FILE,
        skipCustomResources: false,
        stackFilters: [],
        stage: undefined,
        reportFile: undefined,
      },
    });
  });

  test('supports explicit convert subcommand', () => {
    expect(parseArguments(['convert', '--assembly', './cdk.out'])).toEqual({
      command: 'convert',
      options: {
        assemblyDir: './cdk.out',
        outFile: DEFAULT_OUTPUT_FILE,
        skipCustomResources: false,
        stackFilters: [],
        stage: undefined,
        reportFile: `${DEFAULT_OUTPUT_FILE}.report.json`,
      },
    });
  });

  test('parses analyze subcommand flags', () => {
    expect(
      parseArguments([
        'analyze',
        '--assembly',
        '../cdk.out',
        '--stage',
        'Beta',
        '--format',
        'yaml',
        '--output',
        'report.yaml',
      ]),
    ).toEqual({
      command: 'analyze',
      options: {
        assemblyDir: '../cdk.out',
        stage: 'Beta',
        format: 'yaml',
        outputFile: 'report.yaml',
      },
    });
  });
});

describe('runCliWithOptions', () => {
  test('loads program IR and writes YAML plus report', () => {
    mockedConvert.mockReturnValue({ stacks: [] });
    mockedSerialize.mockReturnValue('name: cdk');

    runCliWithOptions({
      assemblyDir: '/app/cdk.out',
      outFile: '/tmp/out/pulumi.yaml',
      skipCustomResources: false,
      stackFilters: [],
      stage: undefined,
      reportFile: '/tmp/out/pulumi.yaml.report.json',
    });

    expect(mockedConvert).toHaveBeenCalledWith('/app/cdk.out', undefined);
    expect(mockedSerialize).toHaveBeenCalledWith({ stacks: [] });
    expect(mockedFs.ensureDirSync).toHaveBeenNthCalledWith(1, '/tmp/out');
    expect(mockedFs.writeFileSync).toHaveBeenNthCalledWith(
      1,
      '/tmp/out/pulumi.yaml',
      'name: cdk',
    );
    expect(mockedFs.ensureDirSync).toHaveBeenNthCalledWith(2, '/tmp/out');
    expect(mockedFs.writeFileSync.mock.calls[1][0]).toBe(
      '/tmp/out/pulumi.yaml.report.json',
    );
    expect(mockedFs.writeFileSync.mock.calls[1][1]).toContain('"stacks"');
  });

  test('filters stacks before post-processing', () => {
    const program = {
      stacks: [
        { stackId: 'StackA', stackPath: 'StackA', resources: [] },
        { stackId: 'StackB', stackPath: 'StackB', resources: [] },
      ],
    } as any;
    mockedConvert.mockReturnValue(program);
    mockedPostProcess.mockImplementation((p) => p);

    runCliWithOptions({
      assemblyDir: '/app/cdk.out',
      outFile: '/tmp/out/pulumi.yaml',
      skipCustomResources: false,
      stackFilters: ['StackB'],
      stage: undefined,
      reportFile: undefined,
    });

    const passedSet = mockedConvert.mock.calls[0][1] as Set<string>;
    expect(passedSet).toBeInstanceOf(Set);
    expect(Array.from(passedSet)).toEqual(['StackB']);
    expect(mockedPostProcess).toHaveBeenCalledWith(
      {
        stacks: [{ stackId: 'StackB', stackPath: 'StackB', resources: [] }],
      },
      { skipCustomResources: false, reportCollector: undefined },
    );
  });

  test('throws when requested stack missing', () => {
    mockedConvert.mockReturnValue({ stacks: [] });

    expect(() =>
      runCliWithOptions({
        assemblyDir: '/app/cdk.out',
        outFile: '/tmp/out/pulumi.yaml',
        skipCustomResources: false,
        stackFilters: ['Missing'],
        stage: undefined,
        reportFile: undefined,
      }),
    ).toThrow(/Unknown stack/);
  });

  test('uses stage-specific converter when provided', () => {
    mockedConvertStage.mockReturnValue({ stacks: [] } as any);

    runCliWithOptions({
      assemblyDir: '/app/cdk.out',
      outFile: '/tmp/out/pulumi.yaml',
      skipCustomResources: false,
      stackFilters: [],
      stage: 'DevStage',
      reportFile: undefined,
    });

    expect(mockedConvert).not.toHaveBeenCalled();
    expect(mockedConvertStage).toHaveBeenCalledWith(
      '/app/cdk.out',
      'DevStage',
      undefined,
    );
  });

  test('skips report generation when disabled', () => {
    mockedConvert.mockReturnValue({ stacks: [] });
    mockedSerialize.mockReturnValue('name: cdk');

    runCliWithOptions({
      assemblyDir: '/app/cdk.out',
      outFile: '/tmp/out/pulumi.yaml',
      skipCustomResources: false,
      stackFilters: [],
      stage: undefined,
      reportFile: undefined,
    });

    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/out/pulumi.yaml',
      'name: cdk',
    );
  });
});

describe('runAnalyzeWithOptions', () => {
  test('writes serialized report to stdout by default', () => {
    const logger = { log: jest.fn() };
    runAnalyzeWithOptions(
      { assemblyDir: '/app/cdk.out', format: 'json' },
      logger as any,
    );

    expect(mockedAnalyzer).toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('"schemaVersion"'),
    );
  });

  test('writes to file when output path provided', () => {
    const logger = { log: jest.fn() };
    runAnalyzeWithOptions(
      {
        assemblyDir: '/app/cdk.out',
        format: 'yaml',
        outputFile: '/tmp/report.yaml',
      },
      logger as any,
    );

    expect(mockedFs.ensureDirSync).toHaveBeenCalledWith('/tmp');
    expect(mockedFs.writeFileSync.mock.calls[0][0]).toBe('/tmp/report.yaml');
    expect(logger.log).toHaveBeenCalledWith(
      'Wrote analysis report to /tmp/report.yaml',
    );
  });
});

describe('runCli', () => {
  test('returns error code when required args missing', () => {
    const logger = { log: jest.fn(), error: jest.fn() };
    const code = runCli([], logger as any);
    expect(code).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  test('invokes analyze flow when subcommand specified', () => {
    const logger = { log: jest.fn(), error: jest.fn() };
    const code = runCli(['analyze', '--assembly', './cdk.out'], logger as any);
    expect(code).toBe(0);
    expect(logger.log).toHaveBeenCalled();
  });
});

function createMockAnalysisReport() {
  return {
    metadata: {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      assemblyDirectory: '/tmp/cdk.out',
    },
    app: {
      language: { language: 'unknown', confidence: 'low', signals: [] },
      stageUsage: { usesStages: false, stageCount: 0, stackCount: 0 },
      stages: [],
      stacks: [],
    },
    environments: [],
    constructs: {
      totals: {
        coreL2: 0,
        l1: 0,
        customResources: 0,
        userDefined: 0,
        thirdParty: 0,
        unknown: 0,
      },
      constructs: [],
      userDefined: [],
      pipelines: [],
    },
    resources: { total: 0, byType: [] },
    assets: { total: 0, customResources: [], lambdaFunctions: [], assets: [] },
  };
}
