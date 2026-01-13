import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface SecretsConstructProps {
  encryptionKey: kms.IKey;
  name: string;
  ssmParameterValue?: string;
}

export class Secrets extends Construct {
  public readonly secret: secretsmanager.Secret;
  public readonly ssmParameter: ssm.StringParameter;

  constructor(scope: Construct, id: string, props: SecretsConstructProps) {
    super(scope, id);

    // Secrets Manager Secret
    this.secret = new secretsmanager.Secret(this, 'Secret', {
      encryptionKey: props.encryptionKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
      },
    });

    // Secrets Manager Resource Policy
    new secretsmanager.CfnResourcePolicy(this, 'SecretResourcePolicy', {
      secretId: this.secret.secretArn,
      resourcePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              AWS: `arn:aws:iam::${cdk.Stack.of(this).account}:root`,
            },
            Action: 'secretsmanager:GetSecretValue',
            Resource: this.secret.secretArn,
          },
        ],
      }),
    });

    // SSM Parameter (requires explicit name as it's a path)
    this.ssmParameter = new ssm.StringParameter(this, 'SsmParameter', {
      parameterName: `/${props.name}/parameter`,
      stringValue: props.ssmParameterValue || 'example-value',
    });
  }
}
