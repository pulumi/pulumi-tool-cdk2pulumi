import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import { ContainerRegistry } from './constructs/container-registry-construct';
import { Database } from './constructs/database-construct';
import { Encryption } from './constructs/encryption-construct';
import { EventDriven } from './constructs/event-driven-construct';
import { LambdaCompute } from './constructs/lambda-compute-construct';
import { Messaging } from './constructs/messaging-construct';
import { Observability } from './constructs/observability-construct';
import { Secrets } from './constructs/secrets-construct';
import { Storage } from './constructs/storage-construct';
import { Workflow } from './constructs/workflow-construct';

export interface NeoCdkExampleStackProps extends cdk.StackProps {
  stage: string;
}

export class NeoCdkExampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NeoCdkExampleStackProps) {
    super(scope, id, props);

    const stage = props.stage;

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      // don't create the custom resources
      restrictDefaultSecurityGroup: false,
    });

    const encryption = new Encryption(this, 'Encryption', {
      description: 'KMS key for encryption',
      enableKeyRotation: false, // for dev
    });

    const storage = new Storage(this, 'Storage', {
      encryptionKey: encryption.kmsKey,
      dynamoAutoScaling: {
        minCapacity: 5,
        maxCapacity: 50,
        targetUtilizationPercent: 70,
      },
    });

    new ContainerRegistry(this, 'ContainerRegistry', {
      encryptionKey: encryption.kmsKey,
      imageScanOnPush: true,
    });

    const messaging = new Messaging(this, 'Messaging', {
      encryptionKey: encryption.kmsKey,
      kinesisShardCount: 1,
      enableSnsToSqsSubscription: true,
    });

    new Secrets(this, 'Secrets', {
      encryptionKey: encryption.kmsKey,
      name: `neo/${stage}`,
      ssmParameterValue: 'example-value',
    });

    const lambdaCompute = new LambdaCompute(this, 'LambdaCompute', {
      s3Bucket: storage.s3Bucket,
      dynamoTable: storage.dynamoTable,
      kinesisStream: messaging.kinesisStream,
      sqsQueue: messaging.sqsQueue,
      environment: {
        BUCKET_NAME: storage.s3Bucket.bucketName,
        TABLE_NAME: storage.dynamoTable.tableName,
      },
    });

    // Grant EventBridge permission to invoke Lambda
    lambdaCompute.grantEventBridgeInvoke();

    new Observability(this, 'Observability', {
      lambdaFunction: lambdaCompute.lambdaFunction,
      alarmThreshold: 1,
    });

    new Database(this, 'Database', {
      vpc,
      encryptionKey: encryption.kmsKey,
    });

    new EventDriven(this, 'EventDriven', {
      archiveRetention: cdk.Duration.days(7),
      ruleEventPattern: {
        source: ['neo.example'],
        detailType: ['Example Event'],
      },
      lambdaTargets: [lambdaCompute.lambdaFunction],
      sqsTargets: [messaging.sqsQueue],
    });

    new Workflow(this, 'Workflow', {
      timeout: cdk.Duration.minutes(5),
    });

    new Rule(this, 'TestRule', {
      schedule: Schedule.rate(cdk.Duration.days(1)),
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: storage.s3Bucket.bucketName,
      description: 'Name of the S3 bucket',
    });

    new cdk.CfnOutput(this, 'DynamoTableName', {
      value: storage.dynamoTable.tableName,
      description: 'Name of the DynamoDB table',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: lambdaCompute.lambdaFunction.functionArn,
      description: 'ARN of the Lambda function',
    });
  }
}
