import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { synthesizeAndConvert } from './helpers';
import { ProgramIR } from '../../src/core';

// Integration tests use longer timeout due to CDK synthesis
const INTEGRATION_TIMEOUT = 60000;

describe('Assembly to IR Integration', () => {
  describe('Basic Resources', () => {
    let program: ProgramIR;

    beforeAll(async () => {
      // Single synthesis with multiple resource types
      program = await synthesizeAndConvert(() => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack');

        // S3 Bucket
        new s3.Bucket(stack, 'MyBucket', { bucketName: 'test-bucket' });

        // SQS Queue with properties
        new sqs.Queue(stack, 'MyQueue', {
          queueName: 'test-queue',
          visibilityTimeout: cdk.Duration.seconds(300),
        });

        // SQS Queue with dead letter queue (tests dependencies)
        const dlq = new sqs.Queue(stack, 'DLQ');
        new sqs.Queue(stack, 'MainQueue', {
          deadLetterQueue: {
            queue: dlq,
            maxReceiveCount: 3,
          },
        });

        return app;
      });
    }, INTEGRATION_TIMEOUT);

    test('converts S3 Bucket', () => {
      const bucket = program.stacks[0].resources.find(
        (r) => r.cfnType === 'AWS::S3::Bucket',
      );
      expect(bucket).toBeDefined();
      expect(bucket?.typeToken).toBe('aws-native:s3:Bucket');
      expect(bucket?.props.bucketName).toBe('test-bucket');
    });

    test('converts SQS Queue with property mapping', () => {
      const queue = program.stacks[0].resources.find(
        (r) =>
          r.cfnType === 'AWS::SQS::Queue' && r.props.queueName === 'test-queue',
      );
      expect(queue).toBeDefined();
      expect(queue?.typeToken).toBe('aws-native:sqs:Queue');
      expect(queue?.props.visibilityTimeout).toBe(300);
    });

    test('handles resource dependencies (DLQ)', () => {
      const queues = program.stacks[0].resources.filter(
        (r) => r.cfnType === 'AWS::SQS::Queue',
      );
      // Should have: MyQueue, DLQ, and MainQueue
      expect(queues.length).toBeGreaterThanOrEqual(3);

      // MainQueue should reference DLQ
      const mainQueue = queues.find((q) => q.props.redrivePolicy !== undefined);
      expect(mainQueue).toBeDefined();
    });
  });

  describe('Multi-Stack Apps', () => {
    let program: ProgramIR;
    let filteredProgram: ProgramIR;

    beforeAll(async () => {
      const createMultiStackApp = () => {
        const app = new cdk.App();

        const dataStack = new cdk.Stack(app, 'DataStack');
        new s3.Bucket(dataStack, 'DataBucket');

        const appStack = new cdk.Stack(app, 'AppStack');
        new sqs.Queue(appStack, 'AppQueue');

        return app;
      };

      // Full conversion
      program = await synthesizeAndConvert(createMultiStackApp);

      // Filtered conversion
      filteredProgram = await synthesizeAndConvert(createMultiStackApp, {
        stackFilter: new Set(['DataStack']),
      });
    }, INTEGRATION_TIMEOUT);

    test('converts multiple stacks', () => {
      expect(program.stacks).toHaveLength(2);

      const dataStack = program.stacks.find((s) => s.stackId === 'DataStack');
      const appStack = program.stacks.find((s) => s.stackId === 'AppStack');
      expect(dataStack).toBeDefined();
      expect(appStack).toBeDefined();

      const bucket = dataStack?.resources.find(
        (r) => r.cfnType === 'AWS::S3::Bucket',
      );
      expect(bucket).toBeDefined();

      const queue = appStack?.resources.find(
        (r) => r.cfnType === 'AWS::SQS::Queue',
      );
      expect(queue).toBeDefined();
    });

    test('filters stacks when stackFilter provided', () => {
      expect(filteredProgram.stacks).toHaveLength(1);
      expect(filteredProgram.stacks[0].stackId).toBe('DataStack');
    });
  });
});
