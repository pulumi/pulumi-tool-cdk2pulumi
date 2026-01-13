import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs-extra';
import { summarizeConversionReport, synthesizeAssembly } from './helpers';
import { runCliWithOptions } from '../../src/cli/cli-runner';

const INTEGRATION_TIMEOUT = 60000;

test(
  'smoke: CLI convert produces a stable report summary',
  async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulumi-smoke-'));
    const outFile = path.join(tmpDir, 'Pulumi.yaml');
    const reportFile = `${outFile}.report.json`;

    const { assemblyDir, dispose } = await synthesizeAssembly(() => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'SmokeStack');

      const bucket = new cdk.CfnResource(stack, 'Bucket', {
        type: 'AWS::S3::Bucket',
        properties: {},
      });
      bucket.overrideLogicalId('SmokeBucket');

      const queue = new cdk.CfnResource(stack, 'Queue', {
        type: 'AWS::SQS::Queue',
        properties: {},
      });
      queue.overrideLogicalId('SmokeQueue');

      return app;
    });

    try {
      runCliWithOptions({
        reportFile: reportFile,
        assemblyDir,
        outFile,
        skipCustomResources: true,
        stackFilters: [],
      });

      const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
      const summary = summarizeConversionReport(report);
      expect(summary).toMatchInlineSnapshot(`
        {
          "externalConfigRequirementCount": 0,
          "stacks": [
            {
              "classicFallbackTypes": [],
              "emittedResourceCount": 2,
              "fanOutCount": 0,
              "originalResourceCount": 2,
              "skippedReasons": {},
              "stackId": "SmokeStack",
              "successTypes": [
                "aws-native:s3:Bucket",
                "aws-native:sqs:Queue",
              ],
              "unsupportedTypes": [],
            },
          ],
        }
      `);
    } finally {
      fs.removeSync(tmpDir);
      await dispose();
    }
  },
  INTEGRATION_TIMEOUT,
);
