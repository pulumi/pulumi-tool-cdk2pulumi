import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface WorkflowConstructProps {
  timeout?: cdk.Duration;
  definition?: stepfunctions.IChainable;
}

export class Workflow extends Construct {
  public readonly stateMachine: stepfunctions.StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: WorkflowConstructProps = {},
  ) {
    super(scope, id);

    const definition =
      props.definition ||
      new stepfunctions.Pass(this, 'StartState', {
        result: stepfunctions.Result.fromObject({
          message: 'Hello from Step Functions',
        }),
      });

    // State Machine
    this.stateMachine = new stepfunctions.StateMachine(this, 'StateMachine', {
      definitionBody: stepfunctions.DefinitionBody.fromChainable(definition),
      timeout: props.timeout || cdk.Duration.minutes(5),
    });
  }
}
