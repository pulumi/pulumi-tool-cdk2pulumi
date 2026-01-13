import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs-extra';
import {
  assemblyFromApp,
  summarizeConversionReport,
  synthesizeAssembly,
} from './helpers';
import { runCliWithOptions } from '../../src/cli/cli-runner';

const INTEGRATION_TIMEOUT = 60000;

test(
  'integration test',
  async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulumi-smoke-'));
    const outFile = path.join(tmpDir, 'Pulumi.yaml');
    const reportFile = `${outFile}.report.json`;

    const { assemblyDir, dispose } = await assemblyFromApp(
      path.join(__dirname, '../test-apps/integration-app'),
      {
        'availability-zones:account=123456789123:region=us-east-2': [
          'us-east-2a',
          'us-east-2b',
          'us-east-2c',
        ],
      },
    );

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
             "classicFallbackTypes": [
               "aws:iam/rolePolicy:RolePolicy",
               "aws:rds/proxyDefaultTargetGroup:ProxyDefaultTargetGroup",
               "aws:sqs/queuePolicy:QueuePolicy",
             ],
             "emittedResourceCount": 66,
             "fanOutCount": 0,
             "originalResourceCount": 67,
             "skippedReasons": {
               "cdkMetadata": 1,
             },
             "stackId": "NeoExample-Dev",
             "successTypes": [
               "aws-native:applicationautoscaling:ScalableTarget",
               "aws-native:applicationautoscaling:ScalingPolicy",
               "aws-native:cloudwatch:Alarm",
               "aws-native:dynamodb:Table",
               "aws-native:ec2:Eip",
               "aws-native:ec2:InternetGateway",
               "aws-native:ec2:NatGateway",
               "aws-native:ec2:Route",
               "aws-native:ec2:RouteTable",
               "aws-native:ec2:SecurityGroup",
               "aws-native:ec2:SecurityGroupIngress",
               "aws-native:ec2:Subnet",
               "aws-native:ec2:SubnetRouteTableAssociation",
               "aws-native:ec2:Vpc",
               "aws-native:ec2:VpcGatewayAttachment",
               "aws-native:ecr:Repository",
               "aws-native:events:Archive",
               "aws-native:events:EventBus",
               "aws-native:events:Rule",
               "aws-native:iam:Role",
               "aws-native:kinesis:Stream",
               "aws-native:kms:Key",
               "aws-native:lambda:EventSourceMapping",
               "aws-native:lambda:Function",
               "aws-native:lambda:LayerVersion",
               "aws-native:lambda:Permission",
               "aws-native:logs:LogGroup",
               "aws-native:rds:DbCluster",
               "aws-native:rds:DbInstance",
               "aws-native:rds:DbProxy",
               "aws-native:rds:DbSubnetGroup",
               "aws-native:s3:Bucket",
               "aws-native:s3:BucketPolicy",
               "aws-native:secretsmanager:ResourcePolicy",
               "aws-native:secretsmanager:Secret",
               "aws-native:secretsmanager:SecretTargetAttachment",
               "aws-native:sns:Subscription",
               "aws-native:sns:Topic",
               "aws-native:sqs:Queue",
               "aws-native:ssm:Parameter",
               "aws-native:stepfunctions:StateMachine",
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
