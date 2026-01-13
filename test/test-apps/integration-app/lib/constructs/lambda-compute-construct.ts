import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface LambdaComputeConstructProps {
  runtime?: lambda.Runtime;
  handler?: string;
  code?: lambda.Code;
  layers?: lambda.ILayerVersion[];
  environment?: { [key: string]: string };
  removalPolicy?: cdk.RemovalPolicy;
  // Resources to grant permissions to
  s3Bucket?: s3.IBucket;
  dynamoTable?: dynamodb.ITable;
  kinesisStream?: kinesis.IStream;
  sqsQueue?: sqs.IQueue;
  // Additional IAM statements
  additionalPolicyStatements?: iam.PolicyStatement[];
}

export class LambdaCompute extends Construct {
  public readonly lambdaFunction: lambda.Function;
  public readonly lambdaRole: iam.Role;
  public readonly lambdaPolicy: iam.Policy;
  public readonly lambdaLayer?: lambda.LayerVersion;

  constructor(
    scope: Construct,
    id: string,
    props: LambdaComputeConstructProps = {},
  ) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;

    // IAM Role for Lambda
    this.lambdaRole = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    // Grant permissions using grant methods
    if (props.sqsQueue) {
      props.sqsQueue.grantSendMessages(this.lambdaRole);
    }
    if (props.s3Bucket) {
      props.s3Bucket.grantRead(this.lambdaRole);
    }
    if (props.kinesisStream) {
      props.kinesisStream.grantReadWrite(this.lambdaRole);
    }

    // IAM Policy with additional statements
    const policyStatements = props.additionalPolicyStatements || [];
    if (props.dynamoTable) {
      policyStatements.push(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
          resources: [props.dynamoTable.tableArn],
        }),
      );
    }

    if (policyStatements.length > 0) {
      this.lambdaPolicy = new iam.Policy(this, 'LambdaPolicy', {
        statements: policyStatements,
      });
      this.lambdaPolicy.attachToRole(this.lambdaRole);
    }

    // Lambda Layer (if provided)
    if (props.layers && props.layers.length > 0) {
      // Use provided layers
    } else {
      // Create default layer
      this.lambdaLayer = new lambda.LayerVersion(this, 'LambdaLayer', {
        code: lambda.Code.fromAsset('lambda-layer'),
        compatibleRuntimes: [props.runtime || lambda.Runtime.NODEJS_18_X],
        description: 'Example Lambda layer',
        removalPolicy,
      });
    }

    // Lambda Function
    this.lambdaFunction = new lambda.Function(this, 'LambdaFunction', {
      runtime: props.runtime || lambda.Runtime.NODEJS_18_X,
      handler: props.handler || 'index.handler',
      code:
        props.code ||
        lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Hello from Lambda' }),
          };
        };
      `),
      role: this.lambdaRole,
      layers:
        props.layers || (this.lambdaLayer ? [this.lambdaLayer] : undefined),
      environment: props.environment,
    });

    // Lambda Event Source Mapping (Kinesis) - if provided
    if (props.kinesisStream) {
      this.lambdaFunction.addEventSource(
        new lambdaEventSources.KinesisEventSource(props.kinesisStream, {
          startingPosition: lambda.StartingPosition.TRIM_HORIZON,
          batchSize: 10,
        }),
      );
    }
  }

  /**
   * Grant EventBridge permission to invoke this Lambda function
   */
  public grantEventBridgeInvoke(): void {
    this.lambdaFunction.addPermission('EventBridgeInvoke', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });
  }
}
