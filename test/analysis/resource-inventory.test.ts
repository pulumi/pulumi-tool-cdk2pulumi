import { summarizeResourceInventory } from '../../src/core/analysis';
import { StackManifest } from '../../src/core/assembly';

describe('summarizeResourceInventory', () => {
  it('collects resources across nested stacks and records asset usage', () => {
    const stack = new StackManifest({
      id: 'AppStack',
      templatePath: 'AppStack.template.json',
      metadata: {},
      tree: { id: 'AppStack', path: 'AppStack' },
      template: {
        Resources: {
          Bucket: {
            Type: 'AWS::S3::Bucket',
            Properties: {},
            Metadata: {
              'aws:cdk:path': 'AppStack/Bucket/Resource',
            },
          },
          BucketPolicy: {
            Type: 'AWS::S3::BucketPolicy',
            Properties: {},
            Metadata: {
              'aws:asset:path': 'asset.zip',
            },
          },
        },
      },
      nestedStacks: {
        'AppStack/Nested': {
          logicalId: 'NestedStack',
          Resources: {
            Handler: {
              Type: 'AWS::Lambda::Function',
              Properties: {},
              Metadata: {
                'aws:cdk:path': 'AppStack/Nested/Handler/Resource',
                'aws:asset:path': 'nested-asset.zip',
              },
            },
          },
        },
      },
      dependencies: [],
    });

    const summary = summarizeResourceInventory([stack]);

    expect(summary.total).toBe(3);
    expect(summary.byType).toEqual([
      {
        type: 'AWS::Lambda::Function',
        count: 1,
        resources: [
          {
            stackId: 'AppStack',
            logicalId: 'Handler',
            path: 'AppStack/Nested/Handler/Resource',
            usesAsset: true,
          },
        ],
      },
      {
        type: 'AWS::S3::Bucket',
        count: 1,
        resources: [
          {
            stackId: 'AppStack',
            logicalId: 'Bucket',
            path: 'AppStack/Bucket/Resource',
          },
        ],
      },
      {
        type: 'AWS::S3::BucketPolicy',
        count: 1,
        resources: [
          {
            stackId: 'AppStack',
            logicalId: 'BucketPolicy',
            path: 'AppStack/BucketPolicy',
            usesAsset: true,
          },
        ],
      },
    ]);
  });

  it('groups resources from multiple stacks by type and sorts logical ids', () => {
    const stackA = buildSimpleStack('AlphaStack', 'QueueA');
    const stackB = buildSimpleStack('BetaStack', 'QueueB');

    const summary = summarizeResourceInventory([stackB, stackA]);

    expect(summary.byType).toEqual([
      {
        type: 'AWS::SQS::Queue',
        count: 2,
        resources: [
          {
            stackId: 'AlphaStack',
            logicalId: 'QueueA',
            path: 'AlphaStack/QueueA',
          },
          {
            stackId: 'BetaStack',
            logicalId: 'QueueB',
            path: 'BetaStack/QueueB',
          },
        ],
      },
    ]);
  });
});

function buildSimpleStack(stackId: string, logicalId: string): StackManifest {
  return new StackManifest({
    id: stackId,
    templatePath: `${stackId}.template.json`,
    metadata: {},
    tree: { id: stackId, path: stackId },
    template: {
      Resources: {
        [logicalId]: {
          Type: 'AWS::SQS::Queue',
          Properties: {},
        },
      },
    },
    nestedStacks: {},
    dependencies: [],
  });
}
