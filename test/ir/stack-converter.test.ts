import { CloudFormationTemplate } from '../../src/core';
import { convertStackToIr } from '../../src/core/resolvers';

describe('convertStackToIr', () => {
  test('converts resources with options and outputs', () => {
    const template: CloudFormationTemplate = {
      Resources: {
        MyBucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: 'my-bucket',
          },
          DependsOn: 'OtherResource',
          DeletionPolicy: 'Retain' as any,
        },
        OtherResource: {
          Type: 'AWS::SQS::Queue',
          Properties: {},
        },
      },
      Outputs: {
        BucketName: {
          Value: { Ref: 'MyBucket' },
        },
      },
      Parameters: {
        Env: {
          Type: 'String',
          Default: 'dev',
        },
      },
    };

    const ir = convertStackToIr({
      stackId: 'MyStack',
      stackPath: 'My/Stack',
      template,
    });

    expect(ir).toMatchInlineSnapshot(`
            {
              "outputs": [
                {
                  "description": undefined,
                  "name": "BucketName",
                  "value": {
                    "attributeName": "Ref",
                    "kind": "resourceAttribute",
                    "propertyName": "bucketName",
                    "resource": {
                      "id": "MyBucket",
                      "stackPath": "My/Stack",
                    },
                  },
                },
              ],
              "parameters": [
                {
                  "default": "dev",
                  "name": "Env",
                  "type": "String",
                },
              ],
              "resources": [
                {
                  "cfnProperties": {
                    "BucketName": "my-bucket",
                  },
                  "cfnType": "AWS::S3::Bucket",
                  "logicalId": "MyBucket",
                  "options": {
                    "dependsOn": [
                      {
                        "id": "OtherResource",
                        "stackPath": "My/Stack",
                      },
                    ],
                    "retainOnDelete": true,
                  },
                  "props": {
                    "bucketName": "my-bucket",
                  },
                  "typeToken": "aws-native:s3:Bucket",
                },
                {
                  "cfnProperties": {},
                  "cfnType": "AWS::SQS::Queue",
                  "logicalId": "OtherResource",
                  "options": undefined,
                  "props": {},
                  "typeToken": "aws-native:sqs:Queue",
                },
              ],
              "stackId": "MyStack",
              "stackPath": "My/Stack",
            }
        `);
  });

  test('captures dependsOn arrays and output descriptions', () => {
    const template: CloudFormationTemplate = {
      Resources: {
        Primary: {
          Type: 'AWS::S3::Bucket',
          Properties: {},
          DependsOn: ['First', 'Second'],
        },
        First: {
          Type: 'AWS::SQS::Queue',
          Properties: {},
        },
        Second: {
          Type: 'AWS::SNS::Topic',
          Properties: {},
        },
      },
      Outputs: {
        BucketName: {
          Description: 'Bucket name for consumers',
          Value: { Ref: 'Primary' },
        },
        SkipMe: {
          Value: { Ref: 'AWS::NoValue' },
        },
      },
    };

    const ir = convertStackToIr({
      stackId: 'MyStack',
      stackPath: 'My/Stack',
      template,
    });

    const primary = ir.resources.find(
      (resource) => resource.logicalId === 'Primary',
    );
    expect(primary?.options?.dependsOn).toEqual([
      { id: 'First', stackPath: 'My/Stack' },
      { id: 'Second', stackPath: 'My/Stack' },
    ]);

    expect(ir.outputs).toEqual([
      {
        name: 'BucketName',
        description: 'Bucket name for consumers',
        value: {
          kind: 'resourceAttribute',
          resource: { id: 'Primary', stackPath: 'My/Stack' },
          attributeName: 'Ref',
          propertyName: 'bucketName',
        },
      },
    ]);
  });
});

describe('convertStackToIr - intrinsics', () => {
  test('resolves joins, splits, conditionals, and dynamic references', () => {
    const template: CloudFormationTemplate = {
      Parameters: {
        Env: {
          Type: 'String',
          Default: 'dev',
        },
      },
      Conditions: {
        IsProd: {
          'Fn::Equals': [{ Ref: 'Env' }, 'prod'],
        },
      },
      Resources: {
        MyBucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: {
              'Fn::Join': ['-', ['data', { Ref: 'Env' }, { Ref: 'MyBucket' }]],
            },
            Tags: [
              {
                Key: 'Stage',
                Value: { 'Fn::If': ['IsProd', 'prod', 'non-prod'] },
              },
            ],
            NotificationConfiguration: {
              LambdaConfigurations: {
                'Fn::Split': [',', 'one,two,three'],
              },
            },
            SecretArn:
              '{{resolve:secretsmanager:mySecret:SecretString:password}}',
          },
        },
      },
      Outputs: {
        SecureParam: {
          Value: '{{resolve:ssm-secure:/config/path}}',
        },
      },
    };

    const ir = convertStackToIr({
      stackId: 'MyStack',
      stackPath: 'My/Stack',
      template,
    });

    expect(ir.resources[0].props.bucketName).toEqual({
      kind: 'concat',
      delimiter: '-',
      values: [
        'data',
        {
          kind: 'parameter',
          parameterName: 'Env',
          stackPath: 'My/Stack',
        },
        {
          kind: 'resourceAttribute',
          attributeName: 'Ref',
          propertyName: 'bucketName',
          resource: { id: 'MyBucket', stackPath: 'My/Stack' },
        },
      ],
    });

    expect(ir.resources[0].props.tags[0].value).toBe('non-prod');
    expect(
      ir.resources[0].props.notificationConfiguration.lambdaConfigurations,
    ).toEqual(['one', 'two', 'three']);
    expect(ir.resources[0].props.secretArn).toEqual({
      kind: 'secretsManagerDynamicReference',
      secretId: 'mySecret',
      secretString: 'SecretString',
      jsonKey: 'password',
      versionStage: undefined,
      versionId: undefined,
    });

    expect(ir.outputs?.[0].value).toEqual({
      kind: 'ssmDynamicReference',
      parameterName: '/config/path',
      secure: true,
    });
  });

  test('resolves Fn::If true branch when condition matches', () => {
    const template: CloudFormationTemplate = {
      Conditions: {
        IsProd: {
          'Fn::Equals': ['prod', 'prod'],
        },
      },
      Resources: {
        MyBucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            Tags: [
              {
                Key: 'Stage',
                Value: { 'Fn::If': ['IsProd', 'prod', 'non-prod'] },
              },
            ],
          },
        },
      },
    };

    const ir = convertStackToIr({
      stackId: 'MyStack',
      stackPath: 'My/Stack',
      template,
    });

    expect(ir.resources[0].props.tags[0].value).toBe('prod');
  });
});
