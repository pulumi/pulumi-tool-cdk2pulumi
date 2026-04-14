import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as fs from 'fs-extra';
import { runCliWithOptions } from '../../src/cli/cli-runner';
import { synthesizeAssembly } from '../synth/helpers';
import {
  assertAwsCredentialsAvailable,
  assertPulumiCliAvailable,
  runPulumiPreview,
} from './helpers';

const RUNTIME_TIMEOUT = 300000;

describe('Pulumi runtime validation', () => {
  test(
    'preview succeeds for generated YAML using Fn::GetAZs helper invokes',
    async () => {
      assertPulumiCliAvailable();
      assertAwsCredentialsAvailable();

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulumi-runtime-'));
      const outFile = path.join(tmpDir, 'Pulumi.yaml');
      const parameterSuffix = Date.now().toString(36);
      const { assemblyDir, dispose } = await synthesizeAssembly(() => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'RuntimeValidationStack');

        new ssm.CfnParameter(stack, 'SelectedAzParameter', {
          name: `/cdk2pulumi/runtime/${parameterSuffix}`,
          type: 'String',
          value: cdk.Fn.select(0, cdk.Fn.getAzs()),
        });

        return app;
      });

      try {
        runCliWithOptions({
          assemblyDir,
          outFile,
          skipCustomResources: true,
          stackFilters: [],
        });

        const yaml = fs.readFileSync(outFile, 'utf8');
        expect(yaml).toContain('function: aws-native:getAzs');
        expect(yaml).toContain('arguments: {}');

        runPulumiPreview(tmpDir);
      } finally {
        fs.removeSync(tmpDir);
        await dispose();
      }
    },
    RUNTIME_TIMEOUT,
  );
});
