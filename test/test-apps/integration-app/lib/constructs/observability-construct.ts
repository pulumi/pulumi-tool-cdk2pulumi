import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface ObservabilityConstructProps {
  lambdaFunction?: lambda.IFunction;
  logsDestinationArn?: string;
  alarmThreshold?: number;
  removalPolicy?: cdk.RemovalPolicy;
}

export class Observability extends Construct {
  public readonly logGroup: logs.LogGroup;
  public readonly logsDestination?: logs.CrossAccountDestination;
  public readonly logsSubscriptionFilter?: logs.SubscriptionFilter;
  public readonly cloudWatchAlarm?: cloudwatch.Alarm;

  constructor(
    scope: Construct,
    id: string,
    props: ObservabilityConstructProps = {},
  ) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;

    // CloudWatch Log Group
    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      removalPolicy,
    });

    // Only create destination and subscription filter if a valid destination ARN is provided
    if (props.logsDestinationArn) {
      // Logs Destination Role
      const logsDestinationRole = new iam.Role(this, 'LogsDestinationRole', {
        assumedBy: new iam.ServicePrincipal('logs.amazonaws.com'),
      });

      // CloudWatch Logs Destination
      this.logsDestination = new logs.CrossAccountDestination(
        this,
        'LogsDestination',
        {
          targetArn: props.logsDestinationArn,
          role: logsDestinationRole,
        },
      );

      // Add destination policy to allow same account to write logs
      this.logsDestination.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.AccountRootPrincipal()],
          actions: ['logs:PutSubscriptionFilter'],
          resources: ['*'],
        }),
      );

      // Logs Subscription Filter
      this.logsSubscriptionFilter = new logs.SubscriptionFilter(
        this,
        'LogsSubscriptionFilter',
        {
          logGroup: this.logGroup,
          destination: this.logsDestination,
          filterPattern: logs.FilterPattern.allEvents(),
        },
      );
    }

    // CloudWatch Alarm (if Lambda function provided, auto-named)
    if (props.lambdaFunction) {
      this.cloudWatchAlarm = new cloudwatch.Alarm(this, 'CloudWatchAlarm', {
        metric: props.lambdaFunction.metricErrors(),
        threshold: props.alarmThreshold || 1,
        evaluationPeriods: 1,
        alarmDescription: 'Alarm when Lambda function has errors',
      });
    }
  }
}
