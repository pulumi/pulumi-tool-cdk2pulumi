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

  test('merges IAM policies into Role resources as inline policies', () => {
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

    // Should only have the Role resource (Policy is merged into it)
    expect(stackResources).toHaveLength(1);

    const role = stackResources[0];
    expect(role.logicalId).toBe('MyRole');
    expect(role.cfnType).toBe('AWS::IAM::Role');

    // Check that the inline policy was merged
    expect(role.props?.policies).toBeDefined();
    expect(Array.isArray(role.props.policies)).toBe(true);
    expect(role.props.policies).toHaveLength(1);
    expect(role.props.policies[0]).toMatchObject({
      policyName: 'MyInlinePolicy',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Action: 's3:GetObject', Resource: '*' }],
      },
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
});
