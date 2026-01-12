import { tryParseDynamicReference } from '../../src/core/resolvers/dynamic-references';

describe('dynamic reference parsing', () => {
  test('parses SSM plaintext references', () => {
    expect(
      tryParseDynamicReference('{{resolve:ssm:MySecret}}'),
    ).toEqual({
      kind: 'ssmDynamicReference',
      parameterName: 'MySecret',
      secure: false,
    });

    expect(
      tryParseDynamicReference('{{resolve:ssm:MySecret:1}}'),
    ).toEqual({
      kind: 'ssmDynamicReference',
      parameterName: 'MySecret:1',
      secure: false,
    });
  });

  test('parses SSM secure references', () => {
    expect(
      tryParseDynamicReference('{{resolve:ssm-secure:MySecret}}'),
    ).toEqual({
      kind: 'ssmDynamicReference',
      parameterName: 'MySecret',
      secure: true,
    });
  });

  test('parses Secrets Manager references', () => {
    expect(
      tryParseDynamicReference('{{resolve:secretsmanager:MySecret}}'),
    ).toEqual({
      kind: 'secretsManagerDynamicReference',
      secretId: 'MySecret',
      secretString: undefined,
      jsonKey: undefined,
      versionStage: undefined,
      versionId: undefined,
    });
  });

  test('parses Secrets Manager references with extra colons', () => {
    expect(
      tryParseDynamicReference('{{resolve:secretsmanager:MySecret::::}}'),
    ).toEqual({
      kind: 'secretsManagerDynamicReference',
      secretId: 'MySecret',
      secretString: undefined,
      jsonKey: undefined,
      versionStage: undefined,
      versionId: undefined,
    });
  });

  test('parses Secrets Manager ARN references with json keys', () => {
    expect(
      tryParseDynamicReference(
        '{{resolve:secretsmanager:arn:aws:secretsmanager:us-east-2:12345678910:secret:example-123:SecretString:password::}}',
      ),
    ).toEqual({
      kind: 'secretsManagerDynamicReference',
      secretId:
        'arn:aws:secretsmanager:us-east-2:12345678910:secret:example-123',
      secretString: 'SecretString',
      jsonKey: 'password',
      versionStage: undefined,
      versionId: undefined,
    });
  });

  test('parses Secrets Manager references with version stage', () => {
    expect(
      tryParseDynamicReference(
        '{{resolve:secretsmanager:MySecret:SecretString:password:AWSPREVIOUS}}',
      ),
    ).toEqual({
      kind: 'secretsManagerDynamicReference',
      secretId: 'MySecret',
      secretString: 'SecretString',
      jsonKey: 'password',
      versionStage: 'AWSPREVIOUS',
      versionId: undefined,
    });
  });

  test('parses Secrets Manager references with version ID', () => {
    expect(
      tryParseDynamicReference(
        '{{resolve:secretsmanager:MySecret:SecretString:password::AWSPREVIOUS}}',
      ),
    ).toEqual({
      kind: 'secretsManagerDynamicReference',
      secretId: 'MySecret',
      secretString: 'SecretString',
      jsonKey: 'password',
      versionStage: undefined,
      versionId: 'AWSPREVIOUS',
    });
  });
});
