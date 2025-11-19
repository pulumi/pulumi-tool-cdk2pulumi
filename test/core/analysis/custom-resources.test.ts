import { analyzeCustomResources } from '../../../src/core/analysis/custom-resources';
import { StackManifest } from '../../../src/core/assembly';

// Mock StackManifest
const mockStackManifest = (resources: any): StackManifest => {
  return {
    id: 'test-stack',
    stacks: {
      'test-stack': {
        Resources: resources,
      },
    },
    resourceWithLogicalId: (stackPath: string, logicalId: string) => {
      return resources[logicalId];
    },
  } as any;
};

describe('analyzeCustomResources', () => {
  test('should identify custom resources and resolve service tokens', () => {
    const resources = {
      MyCustomResource: {
        Type: 'Custom::MyResource',
        Properties: {
          ServiceToken: { 'Fn::GetAtt': ['MyFunction', 'Arn'] },
        },
      },
      MyFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Handler: 'index.handler',
          Code: {
            S3Bucket: 'bucket',
            S3Key: 'key',
          },
        },
        Metadata: {
          'aws:asset:path': 'asset-hash',
        },
      },
    };

    const stack = mockStackManifest(resources);
    const assetLookup = (hash: string) =>
      hash === 'asset-hash'
        ? { sourcePath: 'src', packaging: 'zip', destinations: {} }
        : undefined;

    const results = analyzeCustomResources([stack], assetLookup as any);

    expect(results).toHaveLength(1);
    expect(results[0].logicalId).toBe('MyCustomResource');
    expect(results[0].handler).toBe('index.handler');
    expect(results[0].assetPath).toBe('asset-hash');
  });

  test('should ignore non-custom resources', () => {
    const resources = {
      MyBucket: {
        Type: 'AWS::S3::Bucket',
      },
    };

    const stack = mockStackManifest(resources);
    const results = analyzeCustomResources([stack], () => undefined);

    expect(results).toHaveLength(0);
  });
});
