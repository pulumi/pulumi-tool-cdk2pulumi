import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as fs from 'fs-extra';
import { runCliWithOptions } from '../../src/cli/cli-runner';
import { AssemblyManifestReader } from '../../src/core/assembly';
import { synthesizeAssembly } from '../synth/helpers';

describe('cli stage integration', () => {
  const INTEGRATION_TIMEOUT = 60000;

  // This test runs against the real staged assembly fixture checked into the repo to ensure
  // we can convert nested stages end-to-end.
  test(
    'converts DevStage assembly to Pulumi YAML',
    async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulumi-stage-'));
      const outFile = path.join(tmpDir, 'Pulumi.yaml');
      const { assemblyDir, dispose } = await synthesizeAssembly(() => {
        const app = new cdk.App();
        const stage = new cdk.Stage(app, 'DevStage');

        const dataStack = new cdk.Stack(stage, 'DataStack');
        const table = new dynamodb.CfnTable(dataStack, 'PostsTable', {
          billingMode: 'PAY_PER_REQUEST',
          keySchema: [{ attributeName: 'pk', keyType: 'HASH' }],
          attributeDefinitions: [{ attributeName: 'pk', attributeType: 'S' }],
        });
        table.overrideLogicalId('PostsTable');

        const monitoringStack = new cdk.Stack(stage, 'MonitoringStack');
        new cdk.CfnResource(monitoringStack, 'MonitoringBucket', {
          type: 'AWS::S3::Bucket',
          properties: {},
        });
        new ssm.CfnParameter(monitoringStack, 'MonitoringAzParameter', {
          name: '/monitoring/az',
          type: 'String',
          value: cdk.Fn.select(0, cdk.Fn.getAzs()),
        });

        return app;
      });
      try {
        const manifest = AssemblyManifestReader.fromDirectory(assemblyDir);
        const stageManifest = manifest.loadNestedAssembly('DevStage');
        const dataStackManifest = stageManifest.stackManifests.find((stack) =>
          stack.constructTree.path.endsWith('/DataStack'),
        );
        if (!dataStackManifest) {
          throw new Error('Failed to locate DevStage DataStack manifest');
        }

        runCliWithOptions({
          assemblyDir,
          outFile,
          skipCustomResources: true,
          stackFilters: [dataStackManifest.id],
          stage: 'DevStage',
        });

        const yaml = fs.readFileSync(outFile, 'utf8');
        expect(yaml).toContain('PostsTable');
        expect(yaml).not.toContain('aws-native:getAzs');
      } finally {
        fs.removeSync(tmpDir);
        await dispose();
      }
    },
    INTEGRATION_TIMEOUT,
  );

  test(
    'converts all DevStage stacks when Fn::GetAZs outputs are present',
    async () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pulumi-stage-all-'),
      );
      const outFile = path.join(tmpDir, 'Pulumi.yaml');
      const { assemblyDir, dispose } = await synthesizeAssembly(() => {
        const app = new cdk.App();
        const stage = new cdk.Stage(app, 'DevStage');

        const dataStack = new cdk.Stack(stage, 'DataStack');
        new dynamodb.CfnTable(dataStack, 'PostsTable', {
          billingMode: 'PAY_PER_REQUEST',
          keySchema: [{ attributeName: 'pk', keyType: 'HASH' }],
          attributeDefinitions: [{ attributeName: 'pk', attributeType: 'S' }],
        });

        const monitoringStack = new cdk.Stack(stage, 'MonitoringStack');
        new cdk.CfnResource(monitoringStack, 'MonitoringBucket', {
          type: 'AWS::S3::Bucket',
          properties: {},
        });
        new ssm.CfnParameter(monitoringStack, 'MonitoringAzParameter', {
          name: '/monitoring/az',
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
          stage: 'DevStage',
        });

        const yaml = fs.readFileSync(outFile, 'utf8');
        expect(yaml).toContain('PostsTable');
        expect(yaml).toContain('monitoringbucket');
        expect(yaml).toContain('fn::select');
        expect(yaml).toContain('function: aws-native:getAzs');
      } finally {
        fs.removeSync(tmpDir);
        await dispose();
      }
    },
    INTEGRATION_TIMEOUT,
  );
});
