import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface EventDrivenConstructProps {
  archiveRetention?: cdk.Duration;
  ruleEventPattern?: events.EventPattern;
  lambdaTargets?: lambda.IFunction[];
  sqsTargets?: sqs.IQueue[];
}

export class EventDriven extends Construct {
  public readonly eventBus: events.EventBus;
  public readonly eventArchive: events.Archive;
  public readonly eventRule: events.Rule;

  constructor(
    scope: Construct,
    id: string,
    props: EventDrivenConstructProps = {},
  ) {
    super(scope, id);

    const stack = cdk.Stack.of(this);

    // EventBridge Event Bus
    this.eventBus = new events.EventBus(this, 'EventBus', {});

    // EventBridge Archive
    this.eventArchive = new events.Archive(this, 'EventArchive', {
      sourceEventBus: this.eventBus,
      retention: props.archiveRetention || cdk.Duration.days(7),
      eventPattern: props.ruleEventPattern || {
        account: [stack.account],
      },
    });

    // EventBridge Rule
    this.eventRule = new events.Rule(this, 'EventRule', {
      eventBus: this.eventBus,
      eventPattern: props.ruleEventPattern || {
        source: ['neo.example'],
        detailType: ['Example Event'],
      },
    });

    // Add Lambda targets
    if (props.lambdaTargets) {
      props.lambdaTargets.forEach((lambdaFunc) => {
        this.eventRule.addTarget(new eventsTargets.LambdaFunction(lambdaFunc));
      });
    }

    // Add SQS targets
    if (props.sqsTargets) {
      props.sqsTargets.forEach((queue) => {
        this.eventRule.addTarget(new eventsTargets.SqsQueue(queue));
      });
    }
  }
}
