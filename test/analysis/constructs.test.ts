import {
  StackConstructTree,
  summarizeConstructUsage,
} from '../../src/core/analysis';
import { ConstructTree } from '../../src/core/assembly';

describe('summarizeConstructUsage', () => {
  it('aggregates construct totals and captures user defined constructs', () => {
    const stacks: StackConstructTree[] = [
      { stackId: 'AppStack', tree: buildApplicationTree() },
      { stackId: 'PipelineStack', tree: buildPipelineTree() },
    ];

    const summary = summarizeConstructUsage(stacks);

    expect(summary.totals).toEqual({
      coreL2: 5,
      l1: 2,
      customResources: 1,
      userDefined: 1,
      thirdParty: 2,
      unknown: 0,
    });

    expect(summary.constructs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fqn: 'aws-cdk-lib.Stack',
          kind: 'coreL2',
          count: 2,
          stackId: undefined,
        }),
        expect.objectContaining({
          fqn: 'aws-cdk-lib.aws_s3.Bucket',
          kind: 'coreL2',
          count: 1,
          stackId: 'AppStack',
        }),
        expect.objectContaining({
          fqn: 'AWS::S3::Bucket',
          kind: 'l1',
          count: 1,
          stackId: 'AppStack',
        }),
        expect.objectContaining({
          fqn: 'Custom::Cleanup',
          kind: 'customResource',
          count: 1,
        }),
        expect.objectContaining({
          fqn: 'aws-cdk-lib.pipelines.CodePipeline',
          kind: 'coreL2',
          stackId: 'PipelineStack',
        }),
        expect.objectContaining({
          fqn: 'AWS::SNS::Topic',
          kind: 'l1',
          count: 1,
          stackId: 'AppStack',
        }),
      ]),
    );

    expect(summary.userDefined).toEqual([
      {
        path: 'AppStack/Helper',
        children: [
          {
            path: 'AppStack/Helper/Nested',
            fqn: 'my.company.Helper',
            kind: 'thirdParty',
            count: 1,
            stackId: 'AppStack',
          },
        ],
      },
    ]);

    expect(summary.pipelines).toEqual([
      {
        stackId: 'PipelineStack',
        constructPath: 'PipelineStack/Delivery',
        stages: ['Beta'],
      },
    ]);
  });
});

function buildApplicationTree(): ConstructTree {
  return node('AppStack', 'AppStack', {
    fqn: 'aws-cdk-lib.Stack',
    children: {
      Bucket: node('Bucket', 'AppStack/Bucket', {
        fqn: 'aws-cdk-lib.aws_s3.Bucket',
        children: {
          Resource: node('Resource', 'AppStack/Bucket/Resource', {
            fqn: 'aws-cdk-lib.aws_s3.CfnBucket',
            cloudFormationType: 'AWS::S3::Bucket',
          }),
          Cleanup: node('Cleanup', 'AppStack/Bucket/Cleanup', {
            fqn: 'aws-cdk-lib.CustomResource',
            cloudFormationType: 'Custom::Cleanup',
          }),
        },
      }),
      Helper: node('Helper', 'AppStack/Helper', {
        fqn: 'constructs.Construct',
        children: {
          Nested: node('Nested', 'AppStack/Helper/Nested', {
            fqn: 'my.company.Helper',
          }),
        },
      }),
      External: node('External', 'AppStack/External', {
        fqn: 'cdk-monitoring-constructs.DynamicDashboardFactory',
      }),
      Mystery: node('Mystery', 'AppStack/Mystery', {
        cloudFormationType: 'AWS::SNS::Topic',
      }),
    },
  });
}

function buildPipelineTree(): ConstructTree {
  return node('PipelineStack', 'PipelineStack', {
    fqn: 'aws-cdk-lib.Stack',
    children: {
      Delivery: node('Delivery', 'PipelineStack/Delivery', {
        fqn: 'aws-cdk-lib.pipelines.CodePipeline',
        children: {
          Beta: node('Beta', 'PipelineStack/Delivery/Beta', {
            fqn: 'aws-cdk-lib.Stage',
          }),
        },
      }),
    },
  });
}

function node(
  id: string,
  pathParam: string,
  options: {
    fqn?: string;
    children?: Record<string, ConstructTree>;
    cloudFormationType?: string;
  } = {},
): ConstructTree {
  return {
    id,
    path: pathParam,
    children: options.children,
    attributes: options.cloudFormationType
      ? {
          'aws:cdk:cloudformation:type': options.cloudFormationType,
        }
      : undefined,
    constructInfo: options.fqn
      ? {
          fqn: options.fqn,
          version: '1.0.0',
        }
      : undefined,
  };
}
