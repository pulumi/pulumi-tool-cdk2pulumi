import * as path from 'path';
import { MemoryContext, Toolkit } from '@aws-cdk/toolkit-lib';
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs-extra';
import { ConversionReport } from '../../src/cli/conversion-report';
import { ProgramIR } from '../../src/core';
import { convertAssemblyDirectoryToProgramIr } from '../../src/core/assembly';

/**
 * Synthesize a CDK app using toolkit-lib (mimics `cdk synth`), convert to ProgramIR, cleanup.
 * Uses clobberEnv: false to allow parallel test execution.
 */
export async function synthesizeAndConvert(
  buildApp: () => cdk.App,
  options?: { stackFilter?: Set<string> },
): Promise<ProgramIR> {
  const toolkit = new Toolkit({});
  const cx = await toolkit.fromAssemblyBuilder(
    async () => {
      const app = buildApp();
      return app.synth();
    },
    { clobberEnv: false },
  );

  // Produce the cloud assembly (triggers full synthesis like `cdk synth`)
  const readable = await cx.produce();
  try {
    const cloudAssembly = readable.cloudAssembly;
    return convertAssemblyDirectoryToProgramIr(
      cloudAssembly.directory,
      options?.stackFilter,
    );
  } finally {
    // Cleanup the readable resource if it has a dispose method
    if (typeof (readable as any)[Symbol.asyncDispose] === 'function') {
      await (readable as any)[Symbol.asyncDispose]();
    } else if (typeof (readable as any).dispose === 'function') {
      await (readable as any).dispose();
    }
  }
}

export async function assemblyFromApp(
  dir: string,
  initialContext?: Record<string, unknown>,
): Promise<{ assemblyDir: string; dispose: () => Promise<void> }> {
  const toolkit = new Toolkit({});
  const cdkJson = JSON.parse(
    fs.readFileSync(path.join(dir, 'cdk.json'), { encoding: 'utf-8' }),
  );
  const cx = await toolkit.fromCdkApp(cdkJson.app, {
    lookups: false,
    resolveDefaultEnvironment: false,
    contextStore: new MemoryContext(initialContext),
    workingDirectory: dir,
  });

  const readable = await cx.produce();
  const cloudAssembly = readable.cloudAssembly;
  const dispose = async () => {
    if (typeof (readable as any)[Symbol.asyncDispose] === 'function') {
      await (readable as any)[Symbol.asyncDispose]();
    } else if (typeof (readable as any).dispose === 'function') {
      await (readable as any).dispose();
    }
  };

  return { assemblyDir: cloudAssembly.directory, dispose };
}

export async function synthesizeAssembly(
  buildApp: () => cdk.App,
): Promise<{ assemblyDir: string; dispose: () => Promise<void> }> {
  const toolkit = new Toolkit({});
  const cx = await toolkit.fromAssemblyBuilder(
    async () => {
      const app = buildApp();
      return app.synth();
    },
    { clobberEnv: false },
  );

  const readable = await cx.produce();
  const cloudAssembly = readable.cloudAssembly;
  const dispose = async () => {
    if (typeof (readable as any)[Symbol.asyncDispose] === 'function') {
      await (readable as any)[Symbol.asyncDispose]();
    } else if (typeof (readable as any).dispose === 'function') {
      await (readable as any).dispose();
    }
  };

  return { assemblyDir: cloudAssembly.directory, dispose };
}

export interface ConversionReportSummary {
  externalConfigRequirementCount: number;
  stacks: Array<{
    stackId: string;
    originalResourceCount: number;
    emittedResourceCount: number;
    successTypes: string[];
    unsupportedTypes: string[];
    classicFallbackTypes: string[];
    fanOutCount: number;
    skippedReasons: Record<string, number>;
  }>;
}

export function summarizeConversionReport(
  report: ConversionReport,
): ConversionReportSummary {
  return {
    externalConfigRequirementCount: report.externalConfigRequirements.length,
    stacks: report.stacks.map((stack) => {
      const successTypes = new Set<string>();
      const unsupportedTypes = new Set<string>();
      const classicFallbackTypes = new Set<string>();
      let fanOutCount = 0;
      const skippedReasons: Record<string, number> = {};

      for (const entry of stack.entries) {
        switch (entry.kind) {
          case 'success':
            successTypes.add(entry.typeToken);
            break;
          case 'unsupportedType':
            unsupportedTypes.add(entry.cfnType);
            break;
          case 'classicFallback':
            entry.targetTypeTokens.forEach((token) =>
              classicFallbackTypes.add(token),
            );
            break;
          case 'fanOut':
            fanOutCount += 1;
            break;
          case 'skipped': {
            const key = entry.reason;
            skippedReasons[key] = (skippedReasons[key] ?? 0) + 1;
            break;
          }
          default:
            assertNever(entry);
        }
      }

      return {
        stackId: stack.stackId,
        originalResourceCount: stack.originalResourceCount,
        emittedResourceCount: stack.emittedResourceCount,
        successTypes: Array.from(successTypes).sort(),
        unsupportedTypes: Array.from(unsupportedTypes).sort(),
        classicFallbackTypes: Array.from(classicFallbackTypes).sort(),
        fanOutCount,
        skippedReasons,
      };
    }),
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled report entry: ${JSON.stringify(value)}`);
}
