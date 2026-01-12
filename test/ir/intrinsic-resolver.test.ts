import {
  CloudFormationTemplate,
  ConcatValue,
  PropertyValue,
  ResourceAttributeReference,
  CfRefBehavior,
  StackOutputReference,
} from '../../src/core';
import { IntrinsicValueAdapter } from '../../src/core/converters/intrinsic-value-adapter';

import {
  IrIntrinsicValueAdapter,
  IrIntrinsicResolver,
  ResourceMetadataProvider,
} from '../../src/core/resolvers';

class StubIntrinsicValueAdapter implements IntrinsicValueAdapter<
  any,
  PropertyValue
> {
  getResourceAttribute(request: {
    resourceAddress: { stackPath: string; id: string };
    attribute: string;
    propertyName?: string;
  }): PropertyValue {
    return <ResourceAttributeReference>{
      kind: 'resourceAttribute',
      resource: request.resourceAddress,
      attributeName: request.attribute,
      propertyName: request.propertyName,
    };
  }
}

function createResolver(
  overrides: Partial<CloudFormationTemplate> = {},
  adapter: IntrinsicValueAdapter<
    any,
    PropertyValue
  > = new StubIntrinsicValueAdapter(),
  lookup?: (exportName: string) => StackOutputReference | undefined,
) {
  const template: CloudFormationTemplate = {
    Resources: {
      MyBucket: {
        Type: 'AWS::S3::Bucket',
        Properties: {},
      },
    },
    ...overrides,
  } as CloudFormationTemplate;

  return new IrIntrinsicResolver({
    stackPath: 'App/Main',
    template,
    adapter,
    lookupStackOutputByExportName: lookup,
  });
}

const emptyMetadata: ResourceMetadataProvider = {
  tryFindResource: () => undefined,
};

function metadataWithCfRef(cfRef: CfRefBehavior): ResourceMetadataProvider {
  return {
    tryFindResource: () => ({
      inputs: {},
      outputs: {},
      cfRef,
    }),
  };
}

describe('IrIntrinsicResolver intrinsics', () => {
  test('resolves Fn::Sub with inline variables', () => {
    const resolver = createResolver();
    const value = resolver.resolveValue({
      'Fn::Sub': ['prefix-${Var}-suffix', { Var: 'VALUE' }],
    });

    expect(value).toBe('prefix-VALUE-suffix');
  });

  test('resolves Fn::Sub references to resource attributes', () => {
    const resolver = createResolver();
    const value = resolver.resolveValue({
      'Fn::Sub': 'arn:${MyBucket.Arn}:suffix',
    }) as ConcatValue;

    expect(value).toEqual({
      kind: 'concat',
      delimiter: '',
      values: [
        'arn:',
        {
          kind: 'resourceAttribute',
          resource: { stackPath: 'App/Main', id: 'MyBucket' },
          attributeName: 'Arn',
          propertyName: 'Arn',
        },
        ':suffix',
      ],
    });
  });

  test('resolves Fn::Select', () => {
    const resolver = createResolver();
    const value = resolver.resolveValue({
      'Fn::Select': [1, ['a', 'b', 'c']],
    });

    expect(value).toBe('b');
  });

  test('resolves Fn::Base64', () => {
    const resolver = createResolver();
    const value = resolver.resolveValue({
      'Fn::Base64': 'plain-text',
    });

    expect(value).toBe(Buffer.from('plain-text').toString('base64'));
  });

  test('resolves Fn::FindInMap', () => {
    const resolver = createResolver({
      Mappings: {
        RegionMap: {
          'us-east-1': {
            HVM64: 'ami-123',
          },
        },
      },
    });

    const value = resolver.resolveValue({
      'Fn::FindInMap': ['RegionMap', 'us-east-1', 'HVM64'],
    });

    expect(value).toBe('ami-123');
  });

  test('resolves Fn::ImportValue when export is known', () => {
    const resolver = createResolver({}, undefined, (name) =>
      name === 'SharedExport'
        ? {
            kind: 'stackOutput',
            stackPath: 'App/Producer',
            outputName: 'BucketArn',
          }
        : undefined,
    );

    expect(
      resolver.resolveValue({
        'Fn::ImportValue': 'SharedExport',
      }),
    ).toEqual({
      kind: 'stackOutput',
      stackPath: 'App/Producer',
      outputName: 'BucketArn',
    });
  });

  test('throws when Fn::ImportValue cannot resolve export', () => {
    const resolver = createResolver({}, undefined, () => undefined);
    expect(() =>
      resolver.resolveValue({
        'Fn::ImportValue': 'SharedExport',
      }),
    ).toThrow(
      "Unable to resolve export 'SharedExport' referenced by Fn::ImportValue in App/Main",
    );
  });

  test('throws for unsupported Fn::Transform', () => {
    const resolver = createResolver();
    expect(() =>
      resolver.resolveValue({
        'Fn::Transform': {
          Name: 'AWS::Include',
        },
      }),
    ).toThrow(
      'Fn::Transform is not supported – Cfn Template Macros are not supported yet',
    );
  });

  test('throws for unsupported Fn::Cidr', () => {
    const resolver = createResolver();
    expect(() =>
      resolver.resolveValue({
        'Fn::Cidr': ['10.0.0.0/16', 4, 8],
      }),
    ).toThrow('Fn::Cidr is not supported in IR conversion yet');
  });

  test('throws for unsupported Fn::GetAZs', () => {
    const resolver = createResolver();
    expect(() =>
      resolver.resolveValue({
        'Fn::GetAZs': '',
      }),
    ).toThrow('Fn::GetAZs is not supported in IR conversion yet');
  });

  test('treats AWS::NoValue Ref as undefined', () => {
    const resolver = createResolver();
    expect(
      resolver.resolveValue({
        Ref: 'AWS::NoValue',
      }),
    ).toBeUndefined();
  });

  test('returns undefined for pseudo-parameter Refs', () => {
    const resolver = createResolver();
    expect(
      resolver.resolveValue({
        Ref: 'AWS::Region',
      }),
    ).toBeUndefined();
    expect(
      resolver.resolveValue({
        Ref: 'AWS::AccountId',
      }),
    ).toBeUndefined();
  });

  test('resolves Ref to parameters', () => {
    const resolver = createResolver({
      Parameters: {
        Stage: {
          Type: 'String',
          Default: 'dev',
        },
      },
    });

    expect(
      resolver.resolveValue({
        Ref: 'Stage',
      }),
    ).toEqual({
      kind: 'parameter',
      stackPath: 'App/Main',
      parameterName: 'Stage',
    });
  });

  test('resolves Ref to outputs', () => {
    const resolver = createResolver({
      Outputs: {
        BucketArn: {
          Value: { Ref: 'MyBucket' },
        },
      },
    });

    expect(
      resolver.resolveValue({
        Ref: 'BucketArn',
      }),
    ).toEqual({
      kind: 'stackOutput',
      stackPath: 'App/Main',
      outputName: 'BucketArn',
    });
  });

  test('returns undefined for missing Ref targets', () => {
    const resolver = createResolver();
    expect(
      resolver.resolveValue({
        Ref: 'DoesNotExist',
      }),
    ).toBeUndefined();
  });

  test('resolves Fn::GetAtt to resource attributes', () => {
    const resolver = createResolver();
    expect(
      resolver.resolveValue({
        'Fn::GetAtt': ['MyBucket', 'Arn'],
      }),
    ).toEqual({
      kind: 'resourceAttribute',
      resource: { stackPath: 'App/Main', id: 'MyBucket' },
      attributeName: 'Arn',
      propertyName: 'Arn',
    });
  });

  test('Refs point at resource id property when metadata is missing', () => {
    const resolver = createResolver(
      {},
      new IrIntrinsicValueAdapter(emptyMetadata),
    );
    const value = resolver.resolveValue({
      Ref: 'MyBucket',
    }) as ResourceAttributeReference;

    expect(value.propertyName).toBe('id');
  });

  test('Refs use cfRef property metadata when available', () => {
    const resolver = createResolver(
      {},
      new IrIntrinsicValueAdapter(
        metadataWithCfRef({ property: 'BucketName' }),
      ),
    );
    const value = resolver.resolveValue({
      Ref: 'MyBucket',
    }) as ResourceAttributeReference;

    expect(value.propertyName).toBe('bucketName');
  });

  test('Refs concatenate multiple metadata properties with delimiter', () => {
    const resolver = createResolver(
      {},
      new IrIntrinsicValueAdapter(
        metadataWithCfRef({
          properties: ['Region', 'AccountId'],
          delimiter: ':',
        }),
      ),
    );
    const value = resolver.resolveValue({
      Ref: 'MyBucket',
    }) as ConcatValue;

    expect(value.delimiter).toBe(':');
    expect(value.values).toHaveLength(2);
    expect(value.values[0]).toMatchObject({ propertyName: 'region' });
    expect(value.values[1]).toMatchObject({ propertyName: 'accountId' });
  });

  test('Refs throw when metadata marks cfRef unsupported', () => {
    const resolver = createResolver(
      {},
      new IrIntrinsicValueAdapter(metadataWithCfRef({ notSupported: true })),
    );
    expect(() =>
      resolver.resolveValue({
        Ref: 'MyBucket',
      }),
    ).toThrow(
      'Ref intrinsic is not supported for the AWS::S3::Bucket resource type',
    );
  });

  test('resolves Fn::Split when the source is a string', () => {
    const resolver = createResolver();
    expect(
      resolver.resolveValue({
        'Fn::Split': [',', 'a,b,c'],
      }),
    ).toEqual(['a', 'b', 'c']);
  });

  test('returns undefined for Fn::Split when source is not a string', () => {
    const resolver = createResolver();
    expect(
      resolver.resolveValue({
        'Fn::Split': [',', { Ref: 'MyBucket' }],
      }),
    ).toBeUndefined();
  });

  test('resolves Fn::Join with mixed values into concat', () => {
    const resolver = createResolver();
    expect(
      resolver.resolveValue({
        'Fn::Join': ['-', ['prefix', { Ref: 'MyBucket' }]],
      }),
    ).toEqual({
      kind: 'concat',
      delimiter: '-',
      values: [
        'prefix',
        {
          kind: 'resourceAttribute',
          resource: { stackPath: 'App/Main', id: 'MyBucket' },
          attributeName: 'Ref',
          propertyName: 'Ref',
        },
      ],
    });
  });

  test('resolves Fn::Select with string index values', () => {
    const resolver = createResolver();
    expect(
      resolver.resolveValue({
        'Fn::Select': ['1', ['a', 'b', 'c']],
      }),
    ).toBe('b');
  });

  test('resolves Fn::Select out of range to undefined', () => {
    const resolver = createResolver();
    expect(
      resolver.resolveValue({
        'Fn::Select': [3, ['a', 'b']],
      }),
    ).toBeUndefined();
  });

  test('resolves Fn::FindInMap top-level key errors', () => {
    const resolver = createResolver({
      Mappings: {
        RegionMap: {
          dev: {
            Ami: 'ami-123',
          },
        },
      },
    });
    expect(() =>
      resolver.resolveValue({
        'Fn::FindInMap': ['RegionMap', 'prod', 'Ami'],
      }),
    ).toThrow('Key prod not found in mapping RegionMap');
  });

  test('resolves Fn::FindInMap second-level key errors', () => {
    const resolver = createResolver({
      Mappings: {
        RegionMap: {
          dev: {
            Ami: 'ami-123',
          },
        },
      },
    });
    expect(() =>
      resolver.resolveValue({
        'Fn::FindInMap': ['RegionMap', 'dev', 'Missing'],
      }),
    ).toThrow('Key Missing not found in mapping RegionMap.dev');
  });

  test('supports Fn::Sub literal escapes', () => {
    const resolver = createResolver();
    expect(
      resolver.resolveValue({
        'Fn::Sub': 'prefix-${!Literal}-suffix',
      }),
    ).toBe('prefix-${Literal}-suffix');
  });

  test('throws when Fn::FindInMap has no mappings', () => {
    const resolver = createResolver();
    expect(() =>
      resolver.resolveValue({
        'Fn::FindInMap': ['Missing', 'Key', 'Value'],
      }),
    ).toThrow('No mappings defined in template');
  });

  test('throws when Fn::FindInMap mapping name is missing', () => {
    const resolver = createResolver({
      Mappings: {
        Present: {
          Key: {
            Value: 'ok',
          },
        },
      },
    });
    expect(() =>
      resolver.resolveValue({
        'Fn::FindInMap': ['Missing', 'Key', 'Value'],
      }),
    ).toThrow('Mapping Missing not found in template mappings');
  });

  test('throws when Fn::If references missing condition', () => {
    const resolver = createResolver();
    expect(() =>
      resolver.resolveValue({
        'Fn::If': ['UnknownCondition', 'yes', 'no'],
      }),
    ).toThrow('Unable to find condition UnknownCondition');
  });

  test('evaluates condition functions', () => {
    const resolver = createResolver();
    expect(
      resolver.resolveValue({
        'Fn::Equals': ['a', 'a'],
      }),
    ).toBe(true);
    expect(
      resolver.resolveValue({
        'Fn::And': [true, false],
      }),
    ).toBe(false);
    expect(
      resolver.resolveValue({
        'Fn::Or': [false, true],
      }),
    ).toBe(true);
    expect(
      resolver.resolveValue({
        'Fn::Not': [true],
      }),
    ).toBe(false);
  });

  test('validates condition function arity', () => {
    const resolver = createResolver();
    expect(() =>
      resolver.resolveValue({
        'Fn::And': [true],
      }),
    ).toThrow('Fn::And requires between 2 and 10 arguments');
    expect(() =>
      resolver.resolveValue({
        'Fn::Or': [true],
      }),
    ).toThrow('Fn::Or requires between 2 and 10 arguments');
    expect(() =>
      resolver.resolveValue({
        'Fn::Not': [true, false],
      }),
    ).toThrow('Fn::Not requires exactly 1 argument');
  });
});
