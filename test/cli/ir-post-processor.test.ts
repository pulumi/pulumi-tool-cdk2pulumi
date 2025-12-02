import { ConversionReportBuilder } from '../../src/cli/conversion-report';
import { postProcessProgramIr } from '../../src/cli/ir-post-processor';
import { ProgramIR } from '../../src/core';

function makeResource(
  overrides: Partial<ProgramIR['stacks'][number]['resources'][number]>,
) {
  return {
    logicalId: 'Resource',
    cfnType: 'AWS::Test::Resource',
    cfnProperties: {},
    typeToken: 'aws-native:test:Resource',
    props: {},
    ...overrides,
  };
}

describe('postProcessProgramIr', () => {
  test('converts API Gateway V2 Stage to aws classic type', () => {
    const program: ProgramIR = {
      stacks: [
        {
          stackId: 'AppStack',
          stackPath: 'App/Stack',
          resources: [
            makeResource({
              logicalId: 'Stage',
              cfnType: 'AWS::ApiGatewayV2::Stage',
              cfnProperties: {
                ApiId: 'api-123',
                StageName: '$default',
              },
            }),
          ],
        },
      ],
    } as any;

    const processed = postProcessProgramIr(program);
    expect(processed.stacks[0].resources).toHaveLength(1);
    expect(processed.stacks[0].resources[0]).toMatchObject({
      logicalId: 'Stage',
      typeToken: 'aws:apigatewayv2/stage:Stage',
      props: expect.objectContaining({
        apiId: 'api-123',
        name: '$default',
      }),
    });
  });

  test('converts Service Discovery Service to aws classic type', () => {
    const program: ProgramIR = {
      stacks: [
        {
          stackId: 'AppStack',
          stackPath: 'App/Stack',
          resources: [
            makeResource({
              logicalId: 'Service',
              cfnType: 'AWS::ServiceDiscovery::Service',
              cfnProperties: {
                Name: 'example',
                NamespaceId: 'ns-1234',
                Type: 'HTTP',
                DnsConfig: {
                  NamespaceId: 'ns-1234',
                  RoutingPolicy: 'MULTIVALUE',
                  DnsRecords: [
                    {
                      TTL: 10,
                      Type: 'A',
                    },
                  ],
                },
                HealthCheckConfig: {
                  Type: 'HTTP',
                  ResourcePath: '/health',
                  FailureThreshold: 5,
                },
                Tags: [
                  {
                    Key: 'env',
                    Value: 'dev',
                  },
                ],
              },
            }),
          ],
        },
      ],
    } as any;

    const processed = postProcessProgramIr(program);
    const resource = processed.stacks[0].resources[0];
    expect(resource.typeToken).toBe('aws:servicediscovery/service:Service');
    expect(resource.props).toMatchObject({
      name: 'example',
      namespaceId: 'ns-1234',
      type: 'HTTP',
      dnsConfig: {
        namespaceId: 'ns-1234',
        routingPolicy: 'MULTIVALUE',
        dnsRecords: [
          {
            ttl: 10,
            type: 'A',
          },
        ],
      },
      healthCheckConfig: {
        type: 'HTTP',
        resourcePath: '/health',
        failureThreshold: 5,
      },
      tags: {
        env: 'dev',
      },
    });
  });

  test('converts Service Discovery Private DNS Namespace to aws classic type', () => {
    const program: ProgramIR = {
      stacks: [
        {
          stackId: 'AppStack',
          stackPath: 'App/Stack',
          resources: [
            makeResource({
              logicalId: 'Namespace',
              cfnType: 'AWS::ServiceDiscovery::PrivateDnsNamespace',
              cfnProperties: {
                Name: 'example.local',
                Description: 'example',
                Vpc: 'vpc-1234',
                Tags: [
                  {
                    Key: 'env',
                    Value: 'prod',
                  },
                ],
              },
            }),
          ],
        },
      ],
    } as any;

    const processed = postProcessProgramIr(program);
    const resource = processed.stacks[0].resources[0];
    expect(resource.typeToken).toBe(
      'aws:servicediscovery/privateDnsNamespace:PrivateDnsNamespace',
    );
    expect(resource.props).toMatchObject({
      name: 'example.local',
      description: 'example',
      vpc: 'vpc-1234',
      tags: {
        env: 'prod',
      },
    });
  });

  test('converts IAM policies to RolePolicy resources instead of inlining', () => {
    const program: ProgramIR = {
      stacks: [
        {
          stackId: 'AppStack',
          stackPath: 'App/Stack',
          resources: [
            makeResource({
              logicalId: 'MyRole',
              cfnType: 'AWS::IAM::Role',
              cfnProperties: {
                AssumeRolePolicyDocument: {
                  Version: '2012-10-17',
                  Statement: [],
                },
              },
            }),
            makeResource({
              logicalId: 'MyPolicy',
              cfnType: 'AWS::IAM::Policy',
              cfnProperties: {
                PolicyName: 'MyInlinePolicy',
                PolicyDocument: {
                  Version: '2012-10-17',
                  Statement: [
                    { Effect: 'Allow', Action: 's3:GetObject', Resource: '*' },
                  ],
                },
                Roles: [
                  {
                    kind: 'resourceAttribute',
                    resource: { id: 'MyRole', stackPath: 'App/Stack' },
                    attributeName: 'Ref',
                    propertyName: 'Ref',
                  },
                ],
              },
            }),
          ],
        },
      ],
    } as any;

    const processed = postProcessProgramIr(program);
    const stackResources = processed.stacks[0].resources;

    // Should have the Role and a separate RolePolicy
    expect(stackResources).toHaveLength(2);

    const rolePolicy = stackResources.find(
      (r) => r.typeToken === 'aws:iam/rolePolicy:RolePolicy',
    )!;
    expect(rolePolicy.logicalId).toBe('MyPolicy');
    expect(rolePolicy.props).toMatchObject({
      name: 'MyInlinePolicy',
      policy: {
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Action: 's3:GetObject', Resource: '*' }],
      },
      role: expect.anything(),
    });
  });

  test('rewrites custom resources to emulator when staging bucket is present', () => {
    const program: ProgramIR = {
      stacks: [
        {
          stackId: 'StagingStack-123',
          stackPath: 'StagingStack-123',
          resources: [
            makeResource({
              logicalId: 'StagingBucket',
              cfnType: 'AWS::S3::Bucket',
              props: { bucketName: 'cdk-staging-bucket' },
            }),
          ],
        },
        {
          stackId: 'AppStack',
          stackPath: 'App/Stack',
          resources: [
            makeResource({
              logicalId: 'CustomResource',
              cfnType: 'Custom::Demo',
              cfnProperties: {
                ServiceToken: 'arn:aws:lambda:us-east-1:123:function:demo',
              },
            }),
          ],
        },
      ],
    } as any;

    const processed = postProcessProgramIr(program);
    const custom = processed.stacks[1].resources[0];
    expect(custom.typeToken).toBe(
      'aws-native:cloudformation:CustomResourceEmulator',
    );
    expect(custom.props).toMatchObject({
      bucketName: 'cdk-staging-bucket',
      serviceToken: 'arn:aws:lambda:us-east-1:123:function:demo',
      resourceType: 'Custom::Demo',
    });
  });

  test('rewrites custom resources to emulator using provided bucket name when staging bucket stack is absent', () => {
    const program: ProgramIR = {
      stacks: [
        {
          stackId: 'AppStack',
          stackPath: 'App/Stack',
          resources: [
            makeResource({
              logicalId: 'CustomResource',
              cfnType: 'Custom::Demo',
              cfnProperties: {
                ServiceToken: 'arn:aws:lambda:us-east-1:123:function:demo',
              },
            }),
          ],
        },
      ],
    } as any;

    const processed = postProcessProgramIr(program, {
      bootstrapBucketName: 'cdk-hnb659fds-assets-123456789012-us-west-2',
    });
    const custom = processed.stacks[0].resources[0];
    expect(custom.typeToken).toBe(
      'aws-native:cloudformation:CustomResourceEmulator',
    );
    expect(custom.props).toMatchObject({
      bucketName: 'cdk-hnb659fds-assets-123456789012-us-west-2',
      serviceToken: 'arn:aws:lambda:us-east-1:123:function:demo',
      resourceType: 'Custom::Demo',
    });
  });

  test('skips custom resources when option enabled', () => {
    const program: ProgramIR = {
      stacks: [
        {
          stackId: 'AppStack',
          stackPath: 'App/Stack',
          resources: [
            makeResource({
              logicalId: 'CustomResource',
              cfnType: 'Custom::Demo',
            }),
          ],
        },
      ],
    } as any;

    const processed = postProcessProgramIr(program, {
      skipCustomResources: true,
    });
    expect(processed.stacks[0].resources).toHaveLength(0);
  });

  test('drops unsupported aws-native resources and reports them', () => {
    const program: ProgramIR = {
      stacks: [
        {
          stackId: 'AppStack',
          stackPath: 'App/Stack',
          resources: [
            makeResource({
              logicalId: 'Unsupported',
              cfnType: 'AWS::NotAReal::Thing',
              typeToken: 'aws-native:notareal:Thing',
            }),
          ],
        },
      ],
    } as any;

    const report = new ConversionReportBuilder();
    const processed = postProcessProgramIr(program, {
      reportCollector: report,
    });

    // Unsupported resource should be omitted from emitted stacks
    expect(processed.stacks[0].resources).toHaveLength(0);

    const built = report.build();
    expect(built.stacks).toHaveLength(1);
    expect(built.stacks[0].entries).toEqual([
      {
        kind: 'unsupportedType',
        logicalId: 'Unsupported',
        cfnType: 'AWS::NotAReal::Thing',
        reason: 'Type not found in aws-native metadata',
      },
    ]);
    expect(built.stacks[0].emittedResourceCount).toBe(0);
    expect(built.stacks[0].originalResourceCount).toBe(1);
  });

  test('does not drop classic fallbacks as unsupported', () => {
    const program: ProgramIR = {
      stacks: [
        {
          stackId: 'AppStack',
          stackPath: 'App/Stack',
          resources: [
            makeResource({
              logicalId: 'Stage',
              cfnType: 'AWS::ApiGatewayV2::Stage',
              cfnProperties: {
                ApiId: 'api-123',
                StageName: '$default',
              },
            }),
          ],
        },
      ],
    } as any;

    const report = new ConversionReportBuilder();
    const processed = postProcessProgramIr(program, {
      reportCollector: report,
    });

    expect(processed.stacks[0].resources).toHaveLength(1);
    expect(processed.stacks[0].resources[0].typeToken).toBe(
      'aws:apigatewayv2/stage:Stage',
    );

    const entries = report.build().stacks[0].entries;
    expect(entries.find((e) => e.kind === 'unsupportedType')).toBeUndefined();
    expect(
      entries.find(
        (e) =>
          e.kind === 'classicFallback' &&
          e.logicalId === 'Stage' &&
          e.cfnType === 'AWS::ApiGatewayV2::Stage',
      ),
    ).toBeDefined();
  });

  test('converts SQS QueuePolicy to classic and fans out per queue', () => {
    const program: ProgramIR = {
      stacks: [
        {
          stackId: 'AppStack',
          stackPath: 'App/Stack',
          resources: [
            makeResource({
              logicalId: 'MyQueuePolicy',
              cfnType: 'AWS::SQS::QueuePolicy',
              cfnProperties: {
                PolicyDocument: {
                  Version: '2012-10-17',
                  Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }],
                },
                Queues: ['https://example.com/q1', 'https://example.com/q2'],
              },
              props: {
                queues: ['https://example.com/q1', 'https://example.com/q2'],
              },
              options: {
                dependsOn: [{ id: 'Queue', stackPath: 'App/Stack' }],
              },
            }),
          ],
        },
      ],
    } as any;

    const processed = postProcessProgramIr(program);
    const resources = processed.stacks[0].resources;
    expect(resources).toHaveLength(2);

    expect(resources[0]).toMatchObject({
      logicalId: 'MyQueuePolicy',
      typeToken: 'aws:sqs/queuePolicy:QueuePolicy',
      props: {
        policy: {
          Version: '2012-10-17',
          Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }],
        },
        queueUrl: 'https://example.com/q1',
      },
      options: {
        dependsOn: [{ id: 'Queue', stackPath: 'App/Stack' }],
      },
    });

    expect(resources[1]).toMatchObject({
      logicalId: 'MyQueuePolicy-policy-1',
      typeToken: 'aws:sqs/queuePolicy:QueuePolicy',
      props: {
        queueUrl: 'https://example.com/q2',
      },
      options: {
        dependsOn: [{ id: 'Queue', stackPath: 'App/Stack' }],
      },
    });
  });
});
