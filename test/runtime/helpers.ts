import { execFileSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';

export function assertPulumiCliAvailable(): void {
  runPulumiCommand(['version'], process.cwd(), process.env);
}

export function assertAwsCredentialsAvailable(): void {
  try {
    execFileSync('aws', ['sts', 'get-caller-identity'], {
      env: {
        ...process.env,
        AWS_PAGER: '',
        AWS_EC2_METADATA_DISABLED: 'true',
      },
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const result = error as {
      stderr?: string | Buffer;
      status?: number | null;
    };
    const stderr = normalizeOutput(result.stderr);
    throw new Error(
      [
        `AWS credentials are required for test:runtime (aws sts get-caller-identity exited with ${result.status ?? 'unknown'})`,
        stderr ? `stderr:\n${stderr}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n\n'),
    );
  }
}

export function runPulumiPreview(projectDir: string, stackName = 'dev'): void {
  const stateDir = path.join(projectDir, '.pulumi-state');
  const env = {
    ...process.env,
    AWS_EC2_METADATA_DISABLED: 'true',
    PULUMI_CONFIG_PASSPHRASE: 'test',
    PULUMI_HOME: path.join(projectDir, '.pulumi-home'),
    PULUMI_SKIP_UPDATE_CHECK: 'true',
  };

  fs.ensureDirSync(stateDir);

  runPulumiCommand(['login', `file://${stateDir}`], projectDir, env);
  runPulumiCommand(['stack', 'init', stackName], projectDir, env);
  runPulumiCommand(
    ['config', 'set', 'aws-native:region', 'us-east-1', '--stack', stackName],
    projectDir,
    env,
  );
  runPulumiCommand(
    ['preview', '--stack', stackName, '--non-interactive'],
    projectDir,
    env,
  );
}

function runPulumiCommand(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): string {
  try {
    return execFileSync('pulumi', args, {
      cwd,
      env,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const result = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number | null;
    };
    const stdout = normalizeOutput(result.stdout);
    const stderr = normalizeOutput(result.stderr);
    throw new Error(
      [
        `pulumi ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`,
        stdout ? `stdout:\n${stdout}` : undefined,
        stderr ? `stderr:\n${stderr}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n\n'),
    );
  }
}

function normalizeOutput(output: string | Buffer | undefined): string {
  if (output === undefined) {
    return '';
  }

  return typeof output === 'string' ? output.trim() : output.toString().trim();
}
