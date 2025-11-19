import { analyzeLambdaFunctions } from '../../../src/core/analysis/lambdas';
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
  } as any;
};

describe('analyzeLambdaFunctions', () => {
  test('should identify lambda functions and extract details', () => {
    const resources = {
      MyFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Handler: 'index.handler',
          Runtime: 'nodejs14.x',
        },
        Metadata: {
          'aws:asset:path': 'asset-hash',
        },
      },
    };

    const stack = mockStackManifest(resources);
    const results = analyzeLambdaFunctions([stack]);

    expect(results).toHaveLength(1);
    expect(results[0].logicalId).toBe('MyFunction');
    expect(results[0].handler).toBe('index.handler');
    expect(results[0].runtime).toBe('nodejs14.x');
    expect(results[0].assetPath).toBe('asset-hash');
  });

  test('should ignore non-lambda resources', () => {
    const resources = {
      MyBucket: {
        Type: 'AWS::S3::Bucket',
      },
    };

    const stack = mockStackManifest(resources);
    const results = analyzeLambdaFunctions([stack]);

    expect(results).toHaveLength(0);
  });
});
