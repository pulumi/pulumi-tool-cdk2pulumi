import { Toolkit } from '@aws-cdk/toolkit-lib';
import * as cdk from 'aws-cdk-lib';
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
