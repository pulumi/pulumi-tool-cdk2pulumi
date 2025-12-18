import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import {
  synthesizeAndConvert,
  createTestApp,
  createMultiStackApp,
} from './helpers';

// Synthesis takes longer than default 5s timeout
const SYNTH_TIMEOUT = 30000;

describe('Dynamic Synthesis - Basic Resources', () => {
  test(
    'converts S3 Bucket from synthesized assembly',
    async () => {
      const program = await synthesizeAndConvert(() =>
        createTestApp('TestStack', (stack) => {
          new s3.Bucket(stack, 'MyBucket', { bucketName: 'test-bucket' });
        }),
      );

      expect(program.stacks).toHaveLength(1);
      const bucket = program.stacks[0].resources.find(
        (r) => r.cfnType === 'AWS::S3::Bucket',
      );
      expect(bucket).toBeDefined();
      expect(bucket?.typeToken).toBe('aws-native:s3:Bucket');
      expect(bucket?.props.bucketName).toBe('test-bucket');
    },
    SYNTH_TIMEOUT,
  );

  test(
    'converts SQS Queue from synthesized assembly',
    async () => {
      const program = await synthesizeAndConvert(() =>
        createTestApp('TestStack', (stack) => {
          new sqs.Queue(stack, 'MyQueue', {
            queueName: 'test-queue',
            visibilityTimeout: cdk.Duration.seconds(300),
          });
        }),
      );

      expect(program.stacks).toHaveLength(1);
      const queue = program.stacks[0].resources.find(
        (r) => r.cfnType === 'AWS::SQS::Queue',
      );
      expect(queue).toBeDefined();
      expect(queue?.typeToken).toBe('aws-native:sqs:Queue');
      expect(queue?.props.queueName).toBe('test-queue');
      expect(queue?.props.visibilityTimeout).toBe(300);
    },
    SYNTH_TIMEOUT,
  );

  test(
    'converts SQS Queue with dead letter queue dependencies',
    async () => {
      const program = await synthesizeAndConvert(() =>
        createTestApp('TestStack', (stack) => {
          const dlq = new sqs.Queue(stack, 'DLQ');
          new sqs.Queue(stack, 'MainQueue', {
            deadLetterQueue: {
              queue: dlq,
              maxReceiveCount: 3,
            },
          });
        }),
      );

      expect(program.stacks).toHaveLength(1);
      const queues = program.stacks[0].resources.filter(
        (r) => r.cfnType === 'AWS::SQS::Queue',
      );
      expect(queues).toHaveLength(2);
    },
    SYNTH_TIMEOUT,
  );

  test(
    'handles multiple stacks in app',
    async () => {
      const program = await synthesizeAndConvert(() =>
        createMultiStackApp([
          {
            name: 'DataStack',
            addResources: (stack) => {
              new s3.Bucket(stack, 'DataBucket');
            },
          },
          {
            name: 'AppStack',
            addResources: (stack) => {
              new sqs.Queue(stack, 'AppQueue');
            },
          },
        ]),
      );

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
    },
    SYNTH_TIMEOUT,
  );

  test(
    'filters stacks when stackFilter provided',
    async () => {
      const program = await synthesizeAndConvert(
        () =>
          createMultiStackApp([
            {
              name: 'DataStack',
              addResources: (stack) => {
                new s3.Bucket(stack, 'DataBucket');
              },
            },
            {
              name: 'AppStack',
              addResources: (stack) => {
                new sqs.Queue(stack, 'AppQueue');
              },
            },
          ]),
        { stackFilter: new Set(['DataStack']) },
      );

      expect(program.stacks).toHaveLength(1);
      expect(program.stacks[0].stackId).toBe('DataStack');
    },
    SYNTH_TIMEOUT,
  );
});
