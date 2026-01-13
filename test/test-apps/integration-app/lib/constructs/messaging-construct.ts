import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface MessagingConstructProps {
  encryptionKey: kms.IKey;
  removalPolicy?: cdk.RemovalPolicy;
  kinesisShardCount?: number;
  enableSnsToSqsSubscription?: boolean;
}

export class Messaging extends Construct {
  public readonly kinesisStream: kinesis.Stream;
  public readonly sqsQueue: sqs.Queue;
  public readonly snsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MessagingConstructProps) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;

    // Kinesis Stream
    this.kinesisStream = new kinesis.Stream(this, 'KinesisStream', {
      shardCount: props.kinesisShardCount || 1,
      encryption: kinesis.StreamEncryption.KMS,
      encryptionKey: props.encryptionKey,
    });

    // SQS Queue
    this.sqsQueue = new sqs.Queue(this, 'SqsQueue', {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.encryptionKey,
      removalPolicy,
    });

    // SQS Queue Policy
    this.sqsQueue.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('sns.amazonaws.com')],
        actions: ['sqs:SendMessage'],
        resources: [this.sqsQueue.queueArn],
      }),
    );

    // SNS Topic
    this.snsTopic = new sns.Topic(this, 'SnsTopic', {});

    // SNS to SQS Subscription
    if (props.enableSnsToSqsSubscription !== false) {
      this.snsTopic.addSubscription(
        new snsSubscriptions.SqsSubscription(this.sqsQueue),
      );
    }
  }
}
