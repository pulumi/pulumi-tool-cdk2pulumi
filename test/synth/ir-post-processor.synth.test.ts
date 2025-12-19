import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { synthesizeAndConvert } from './helpers';
import { ConversionReportBuilder } from '../../src/cli/conversion-report';
import { postProcessProgramIr } from '../../src/cli/ir-post-processor';
import { ProgramIR, ResourceIR } from '../../src/core';

// Integration tests use longer timeout due to CDK synthesis
const INTEGRATION_TIMEOUT = 60000;

/**
 * Creates a comprehensive CDK app with all resource types that require post-processing.
 */
function createComprehensiveApp(): cdk.App {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack');

  // API Gateway V2 Stage
  const api = new apigatewayv2.CfnApi(stack, 'Api', {
    name: 'TestApi',
    protocolType: 'HTTP',
  });
  new apigatewayv2.CfnStage(stack, 'ApiStage', {
    apiId: api.ref,
    stageName: 'prod',
    autoDeploy: true,
  });

  // Service Discovery Private DNS Namespace
  const namespace = new servicediscovery.CfnPrivateDnsNamespace(
    stack,
    'Namespace',
    {
      name: 'example.local',
      description: 'Test namespace',
      vpc: 'vpc-12345678',
    },
  );

  // Service Discovery Service
  new servicediscovery.CfnService(stack, 'DiscoveryService', {
    name: 'my-service',
    namespaceId: namespace.attrId,
    dnsConfig: {
      namespaceId: namespace.attrId,
      dnsRecords: [{ type: 'A', ttl: 30 }],
      routingPolicy: 'MULTIVALUE',
    },
  });

  // IAM Role and Policy
  const role = new iam.Role(stack, 'MyRole', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });
  new iam.Policy(stack, 'MyPolicy', {
    policyName: 'TestPolicy',
    roles: [role],
    statements: [
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: ['*'],
      }),
    ],
  });

  // Route53 Hosted Zone (used by records below)
  const zone = new route53.HostedZone(stack, 'Zone', {
    zoneName: 'example.com',
  });

  // Route53 A Record
  new route53.CfnRecordSet(stack, 'ARecord', {
    hostedZoneId: zone.hostedZoneId,
    name: 'www.example.com',
    type: 'A',
    ttl: '300',
    resourceRecords: ['1.2.3.4', '5.6.7.8'],
  });

  // Route53 TXT Record
  new route53.TxtRecord(stack, 'TxtRecord', {
    zone,
    recordName: 'txt',
    values: ['simple-value'],
    ttl: cdk.Duration.minutes(5),
  });

  // Route53 Alias Record
  new route53.CfnRecordSet(stack, 'AliasRecord', {
    hostedZoneId: zone.hostedZoneId,
    name: 'alias.example.com',
    type: 'A',
    aliasTarget: {
      dnsName: 'dualstack.my-alb.us-east-1.elb.amazonaws.com',
      hostedZoneId: 'Z35SXDOTRQ7X7K',
      evaluateTargetHealth: true,
    },
  });

  // Route53 Weighted Record
  new route53.CfnRecordSet(stack, 'WeightedRecord', {
    hostedZoneId: zone.hostedZoneId,
    name: 'weighted.example.com',
    type: 'A',
    ttl: '300',
    resourceRecords: ['1.2.3.4'],
    setIdentifier: 'primary',
    weight: 70,
  });

  // Route53 Geolocation Record
  new route53.CfnRecordSet(stack, 'GeoRecord', {
    hostedZoneId: zone.hostedZoneId,
    name: 'geo.example.com',
    type: 'A',
    ttl: '300',
    resourceRecords: ['1.2.3.4'],
    setIdentifier: 'us-records',
    geoLocation: {
      countryCode: 'US',
      subdivisionCode: 'CA',
    },
  });

  // Route53 Failover Record
  new route53.CfnRecordSet(stack, 'FailoverRecord', {
    hostedZoneId: zone.hostedZoneId,
    name: 'failover.example.com',
    type: 'A',
    ttl: '300',
    resourceRecords: ['1.2.3.4'],
    setIdentifier: 'primary',
    failover: 'PRIMARY',
  });

  // SQS Queues and QueuePolicy
  const queue1 = new sqs.Queue(stack, 'Queue1');
  const queue2 = new sqs.Queue(stack, 'Queue2');
  new sqs.QueuePolicy(stack, 'QueuePolicy', {
    queues: [queue1, queue2],
  }).document.addStatements(
    new iam.PolicyStatement({
      actions: ['sqs:SendMessage'],
      principals: [new iam.AnyPrincipal()],
      resources: ['*'],
    }),
  );

  // Custom Resource
  const handler = new lambda.Function(stack, 'CustomResourceHandler', {
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler = async () => {}'),
  });
  new cdk.CustomResource(stack, 'CustomResource', {
    serviceToken: handler.functionArn,
    resourceType: 'Custom::TestResource',
  });

  // Unsupported resource (fake CFN type)
  new cdk.CfnResource(stack, 'UnsupportedResource', {
    type: 'AWS::NotAReal::Thing',
    properties: { Name: 'test' },
  });

  return app;
}

/**
 * Helper to find a resource by type token in processed output.
 */
function findResource(
  program: ProgramIR,
  typeToken: string,
  stackId = 'TestStack',
): ResourceIR | undefined {
  const stack = program.stacks.find((s) => s.stackId === stackId);
  return stack?.resources.find((r) => r.typeToken === typeToken);
}

/**
 * Helper to find all resources by type token.
 */
function findResources(
  program: ProgramIR,
  typeToken: string,
  stackId = 'TestStack',
): ResourceIR[] {
  const stack = program.stacks.find((s) => s.stackId === stackId);
  return stack?.resources.filter((r) => r.typeToken === typeToken) ?? [];
}

describe('IR Post-Processor Integration', () => {
  let program: ProgramIR;
  let processed: ProgramIR;
  let report: ConversionReportBuilder;

  beforeAll(async () => {
    // Single synthesis for all tests
    program = await synthesizeAndConvert(() => createComprehensiveApp());
    report = new ConversionReportBuilder();
    processed = postProcessProgramIr(program, { reportCollector: report });
  }, INTEGRATION_TIMEOUT);

  describe('API Gateway V2', () => {
    test('converts Stage to aws classic type', () => {
      const stage = findResource(processed, 'aws:apigatewayv2/stage:Stage');
      expect(stage).toBeDefined();
      expect(stage?.props.name).toBe('prod');
      expect(stage?.props.autoDeploy).toBe(true);
    });
  });

  describe('Service Discovery', () => {
    test('converts PrivateDnsNamespace to aws classic type', () => {
      const namespace = findResource(
        processed,
        'aws:servicediscovery/privateDnsNamespace:PrivateDnsNamespace',
      );
      expect(namespace).toBeDefined();
      expect(namespace?.props.name).toBe('example.local');
      expect(namespace?.props.description).toBe('Test namespace');
    });

    test('converts Service to aws classic type', () => {
      const service = findResource(
        processed,
        'aws:servicediscovery/service:Service',
      );
      expect(service).toBeDefined();
      expect(service?.props.name).toBe('my-service');
      expect(service?.props.dnsConfig).toBeDefined();
    });
  });

  describe('IAM Policies', () => {
    test('converts Policy to RolePolicy resources', () => {
      const rolePolicy = findResource(
        processed,
        'aws:iam/rolePolicy:RolePolicy',
      );
      expect(rolePolicy).toBeDefined();
      expect(rolePolicy?.props.name).toBe('TestPolicy');
      expect(rolePolicy?.props.policy).toBeDefined();
      expect(rolePolicy?.props.role).toBeDefined();
    });
  });

  describe('Route53 RecordSet', () => {
    test('converts A record to aws classic type', () => {
      const records = findResources(processed, 'aws:route53/record:Record');
      const aRecord = records.find(
        (r) => r.props.type === 'A' && r.props.records?.includes('1.2.3.4'),
      );
      expect(aRecord).toBeDefined();
      expect(aRecord?.props.ttl).toBe('300');
      expect(aRecord?.props.records).toContain('5.6.7.8');
    });

    test('converts TXT record and strips CDK quote wrapping', () => {
      const records = findResources(processed, 'aws:route53/record:Record');
      const txtRecord = records.find((r) => r.props.type === 'TXT');
      expect(txtRecord).toBeDefined();
      expect(txtRecord?.props.records).toContain('simple-value');
    });

    test('converts alias record with alias target', () => {
      const records = findResources(processed, 'aws:route53/record:Record');
      const aliasRecord = records.find((r) => r.props.aliases !== undefined);
      expect(aliasRecord).toBeDefined();
      expect(aliasRecord?.props.aliases).toHaveLength(1);
      expect(aliasRecord?.props.aliases[0]).toMatchObject({
        name: 'dualstack.my-alb.us-east-1.elb.amazonaws.com',
        zoneId: 'Z35SXDOTRQ7X7K',
        evaluateTargetHealth: true,
      });
    });

    test('converts weighted routing policy', () => {
      const records = findResources(processed, 'aws:route53/record:Record');
      const weightedRecord = records.find(
        (r) => r.props.weightedRoutingPolicies !== undefined,
      );
      expect(weightedRecord).toBeDefined();
      expect(weightedRecord?.props.setIdentifier).toBe('primary');
      expect(weightedRecord?.props.weightedRoutingPolicies).toEqual([
        { weight: 70 },
      ]);
    });

    test('converts geolocation routing policy', () => {
      const records = findResources(processed, 'aws:route53/record:Record');
      const geoRecord = records.find(
        (r) => r.props.geolocationRoutingPolicies !== undefined,
      );
      expect(geoRecord).toBeDefined();
      expect(geoRecord?.props.setIdentifier).toBe('us-records');
      expect(geoRecord?.props.geolocationRoutingPolicies).toEqual([
        { country: 'US', subdivision: 'CA' },
      ]);
    });

    test('converts failover routing policy', () => {
      const records = findResources(processed, 'aws:route53/record:Record');
      const failoverRecord = records.find(
        (r) => r.props.failoverRoutingPolicies !== undefined,
      );
      expect(failoverRecord).toBeDefined();
      expect(failoverRecord?.props.failoverRoutingPolicies).toEqual([
        { type: 'PRIMARY' },
      ]);
    });
  });

  describe('SQS QueuePolicy', () => {
    test('fans out to one policy per queue', () => {
      const policies = findResources(
        processed,
        'aws:sqs/queuePolicy:QueuePolicy',
      );
      expect(policies.length).toBeGreaterThanOrEqual(2);
      for (const policy of policies) {
        expect(policy.props.queueUrl).toBeDefined();
        expect(policy.props.policy).toBeDefined();
      }
    });
  });

  describe('Custom Resources', () => {
    test('rewrites to emulator', () => {
      const emulator = findResource(
        processed,
        'aws-native:cloudformation:CustomResourceEmulator',
      );
      expect(emulator).toBeDefined();
      expect(emulator?.props.resourceType).toBe('Custom::TestResource');
      expect(emulator?.props.serviceToken).toBeDefined();
    });
  });

  describe('Unsupported Resources', () => {
    test('drops unsupported aws-native resources', () => {
      const unsupported = processed.stacks[0].resources.find(
        (r) => r.cfnType === 'AWS::NotAReal::Thing',
      );
      expect(unsupported).toBeUndefined();
    });

    test('reports unsupported resources', () => {
      const built = report.build();
      const unsupportedEntry = built.stacks[0]?.entries.find(
        (e) =>
          e.kind === 'unsupportedType' && e.cfnType === 'AWS::NotAReal::Thing',
      );
      expect(unsupportedEntry).toBeDefined();
      expect(unsupportedEntry).toMatchObject({
        kind: 'unsupportedType',
        reason: 'Type not found in aws-native metadata',
      });
    });

    test('does not report classic fallbacks as unsupported', () => {
      const built = report.build();
      const unsupportedStage = built.stacks[0]?.entries.find(
        (e) =>
          e.kind === 'unsupportedType' &&
          e.cfnType === 'AWS::ApiGatewayV2::Stage',
      );
      expect(unsupportedStage).toBeUndefined();
    });
  });
});

describe('IR Post-Processor Options', () => {
  test(
    'skipCustomResources removes custom resources from output',
    async () => {
      const program = await synthesizeAndConvert(() => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack');
        const handler = new lambda.Function(stack, 'Handler', {
          runtime: lambda.Runtime.NODEJS_18_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => {}'),
        });
        new cdk.CustomResource(stack, 'CustomResource', {
          serviceToken: handler.functionArn,
          resourceType: 'Custom::Demo',
        });
        return app;
      });

      const processed = postProcessProgramIr(program, {
        skipCustomResources: true,
      });

      const customResource = processed.stacks[0].resources.find(
        (r) =>
          r.cfnType === 'Custom::Demo' ||
          r.typeToken === 'aws-native:cloudformation:CustomResourceEmulator',
      );
      expect(customResource).toBeUndefined();
    },
    INTEGRATION_TIMEOUT,
  );

  test(
    'bootstrapBucketName with AWS::AccountId intrinsic is replaced',
    async () => {
      const program = await synthesizeAndConvert(() => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack');
        const handler = new lambda.Function(stack, 'Handler', {
          runtime: lambda.Runtime.NODEJS_18_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => {}'),
        });
        new cdk.CustomResource(stack, 'CustomResource', {
          serviceToken: handler.functionArn,
          resourceType: 'Custom::Demo',
        });
        return app;
      });

      const processed = postProcessProgramIr(program, {
        bootstrapBucketName: 'cdk-hnb659fds-assets-${AWS::AccountId}-us-west-2',
      });

      const emulator = processed.stacks[0].resources.find(
        (r) =>
          r.typeToken === 'aws-native:cloudformation:CustomResourceEmulator',
      );
      expect(emulator?.props?.bucketName).toEqual({
        kind: 'concat',
        delimiter: '',
        values: [
          'cdk-hnb659fds-assets-',
          {
            'fn::invoke': {
              function: 'aws:index/getCallerIdentity:getCallerIdentity',
              arguments: {},
              return: 'accountId',
            },
          },
          '-us-west-2',
        ],
      });
    },
    INTEGRATION_TIMEOUT,
  );

  test(
    'bootstrapBucketName uses provided bucket name',
    async () => {
      const program = await synthesizeAndConvert(() => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack');
        const handler = new lambda.Function(stack, 'Handler', {
          runtime: lambda.Runtime.NODEJS_18_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => {}'),
        });
        new cdk.CustomResource(stack, 'CustomResource', {
          serviceToken: handler.functionArn,
          resourceType: 'Custom::Demo',
        });
        return app;
      });

      const processed = postProcessProgramIr(program, {
        bootstrapBucketName: 'my-custom-bucket',
      });

      const emulator = processed.stacks[0].resources.find(
        (r) =>
          r.typeToken === 'aws-native:cloudformation:CustomResourceEmulator',
      );
      expect(emulator?.props?.bucketName).toBe('my-custom-bucket');
    },
    INTEGRATION_TIMEOUT,
  );

  test(
    'staging bucket from StagingStack is used for custom resources',
    async () => {
      const program = await synthesizeAndConvert(() => {
        const app = new cdk.App();

        // Staging stack with a bucket
        const stagingStack = new cdk.Stack(app, 'StagingStack');
        new cdk.aws_s3.Bucket(stagingStack, 'StagingBucket', {
          bucketName: 'cdk-staging-bucket',
        });

        // App stack with custom resource
        const appStack = new cdk.Stack(app, 'AppStack');
        const handler = new lambda.Function(appStack, 'Handler', {
          runtime: lambda.Runtime.NODEJS_18_X,
          handler: 'index.handler',
          code: lambda.Code.fromInline('exports.handler = async () => {}'),
        });
        new cdk.CustomResource(appStack, 'CustomResource', {
          serviceToken: handler.functionArn,
          resourceType: 'Custom::TestResource',
        });

        return app;
      });

      const processed = postProcessProgramIr(program);
      const appStack = processed.stacks.find((s) => s.stackId === 'AppStack');
      const emulator = appStack?.resources.find(
        (r) =>
          r.typeToken === 'aws-native:cloudformation:CustomResourceEmulator',
      );

      expect(emulator).toBeDefined();
      expect(emulator?.props.bucketName).toBe('cdk-staging-bucket');
    },
    INTEGRATION_TIMEOUT,
  );
});
