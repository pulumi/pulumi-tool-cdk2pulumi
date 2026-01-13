import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface StorageConstructProps {
  encryptionKey: kms.IKey;
  removalPolicy?: cdk.RemovalPolicy;
  dynamoTablePartitionKey?: { name: string; type: dynamodb.AttributeType };
  dynamoReadCapacity?: number;
  dynamoWriteCapacity?: number;
  dynamoAutoScaling?: {
    minCapacity: number;
    maxCapacity: number;
    targetUtilizationPercent: number;
  };
}

export class Storage extends Construct {
  public readonly s3Bucket: s3.Bucket;
  public readonly dynamoTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StorageConstructProps) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;

    // S3 Bucket
    this.s3Bucket = new s3.Bucket(this, 'S3Bucket', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.encryptionKey,
      versioned: true,
      removalPolicy,
    });

    // S3 Bucket Policy
    this.s3Bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('s3.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [this.s3Bucket.arnForObjects('*')],
      }),
    );

    // DynamoDB Table
    this.dynamoTable = new dynamodb.Table(this, 'DynamoTable', {
      partitionKey: props.dynamoTablePartitionKey || {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: props.dynamoReadCapacity || 5,
      writeCapacity: props.dynamoWriteCapacity || 5,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.encryptionKey,
      removalPolicy,
    });

    // Application Auto Scaling for DynamoDB
    if (props.dynamoAutoScaling) {
      const readScaling = this.dynamoTable.autoScaleReadCapacity({
        minCapacity: props.dynamoAutoScaling.minCapacity,
        maxCapacity: props.dynamoAutoScaling.maxCapacity,
      });
      readScaling.scaleOnUtilization({
        targetUtilizationPercent:
          props.dynamoAutoScaling.targetUtilizationPercent,
      });
    }
  }
}
