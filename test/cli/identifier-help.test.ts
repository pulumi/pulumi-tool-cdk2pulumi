import { lookupIdentifier, IdLookupError } from '../../src/cli/identifier-help';

describe('lookupIdentifier', () => {
  test('resolves aws-native resource with annotated parts', () => {
    const info = lookupIdentifier('aws-native:acmpca:Certificate');
    expect(info.cfnType).toBe('AWS::ACMPCA::Certificate');
    expect(info.provider).toBe('aws-native');
    expect(info.format).toBe('{arn}/{certificateAuthorityArn}');
    const arn = info.parts.find((p) => p.name === 'arn');
    const caArn = info.parts.find((p) => p.name === 'certificateAuthorityArn');
    expect(arn?.source).toBe('output');
    expect(caArn?.source).toBe('input');
    expect(caArn?.description?.length).toBeGreaterThan(0);
  });

  test('resolves aws classic resource with import doc', () => {
    const info = lookupIdentifier('AWS::ApiGatewayV2::Stage');
    expect(info.provider).toBe('aws');
    expect(info.importDoc).toBeDefined();
    expect(info.format).toContain('{apiId}');
    expect(info.parts.every((p) => p.source === 'segment')).toBe(true);
  });

  test('suggests similar types when unknown', () => {
    try {
      lookupIdentifier('aws-native:doesnot:Exist');
      fail('Expected IdLookupError');
    } catch (err) {
      expect(err).toBeInstanceOf(IdLookupError);
      const e = err as IdLookupError;
      expect(e.suggestions?.length).toBeGreaterThan(0);
    }
  });
});
