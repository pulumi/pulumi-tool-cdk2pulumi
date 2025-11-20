import {
    PropertySerializationContext,
    serializePropertyValue,
} from '../../src/cli/property-serializer';
import {
    ConcatValue,
    StackAddress,
} from '../../src/core';

function makeCtx(
    overrides?: Partial<PropertySerializationContext>,
): PropertySerializationContext {
    return {
        getResourceName: (addr: StackAddress) => `${addr.stackPath}-${addr.id}`,
        getStackOutputName: () => 'AppOutputs_bucketName',
        getParameterDefault: () => 'param-default',
        ...overrides,
    };
}

describe('serializePropertyValue optimization', () => {
    test('optimizes empty delimiter concat into string interpolation', () => {
        const ctx = makeCtx();
        const concat: ConcatValue = {
            kind: 'concat',
            delimiter: '',
            values: [
                'prefix-',
                {
                    kind: 'stackOutput',
                    stackPath: 'Stacks/Main',
                    outputName: 'BucketName',
                },
                '-suffix',
            ],
        };

        // Expectation: Should be a single string with interpolation, NOT fn::join
        expect(serializePropertyValue(concat, ctx)).toBe(
            'prefix-${AppOutputs_bucketName}-suffix',
        );
    });

    test('keeps fn::join for non-empty delimiter', () => {
        const ctx = makeCtx();
        const concat: ConcatValue = {
            kind: 'concat',
            delimiter: '-',
            values: [
                'prefix',
                {
                    kind: 'stackOutput',
                    stackPath: 'Stacks/Main',
                    outputName: 'BucketName',
                },
            ],
        };

        // Expectation: Should still use fn::join because delimiter is not empty
        expect(serializePropertyValue(concat, ctx)).toEqual({
            'fn::join': ['-', ['prefix', '${AppOutputs_bucketName}']],
        });
    });
});
