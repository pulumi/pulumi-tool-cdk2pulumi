import { serializePropertyValue } from '../../src/cli/property-serializer';

const ctx = {
  getResourceName: () => undefined,
  getStackOutputName: () => undefined,
  getParameterDefault: () => undefined,
};

describe('serializePropertyValue dynamic references', () => {
  test('serializes SSM plaintext references', () => {
    const result = serializePropertyValue(
      {
        kind: 'ssmDynamicReference',
        parameterName: '/config/value',
        secure: false,
      },
      ctx,
    );

    expect(result).toEqual({
      'fn::invoke': {
        function: 'aws:ssm:getParameter',
        arguments: {
          name: '/config/value',
          withDecryption: false,
        },
        return: 'value',
      },
    });
  });

  test('serializes SSM secure references', () => {
    const result = serializePropertyValue(
      {
        kind: 'ssmDynamicReference',
        parameterName: '/config/secret',
        secure: true,
      },
      ctx,
    );

    expect(result).toEqual({
      'fn::secret': {
        'fn::invoke': {
          function: 'aws:ssm:getParameter',
          arguments: {
            name: '/config/secret',
            withDecryption: true,
          },
          return: 'value',
        },
      },
    });
  });

  test('serializes Secrets Manager references', () => {
    const result = serializePropertyValue(
      {
        kind: 'secretsManagerDynamicReference',
        secretId: 'my-secret',
        secretString: 'SecretString',
        jsonKey: undefined,
        versionStage: undefined,
        versionId: undefined,
      },
      ctx,
    );

    expect(result).toEqual({
      'fn::secret': {
        'fn::invoke': {
          function: 'aws:secretsmanager:getSecretVersion',
          arguments: {
            secretId: 'my-secret',
          },
          return: 'secretString',
        },
      },
    });
  });

  test('serializes Secrets Manager binary references', () => {
    const result = serializePropertyValue(
      {
        kind: 'secretsManagerDynamicReference',
        secretId: 'my-secret',
        secretString: 'SecretBinary',
        jsonKey: undefined,
        versionStage: undefined,
        versionId: undefined,
      },
      ctx,
    );

    expect(result).toEqual({
      'fn::secret': {
        'fn::invoke': {
          function: 'aws:secretsmanager:getSecretVersion',
          arguments: {
            secretId: 'my-secret',
          },
          return: 'secretBinary',
        },
      },
    });
  });

  test('serializes Secrets Manager references with version selectors', () => {
    const result = serializePropertyValue(
      {
        kind: 'secretsManagerDynamicReference',
        secretId: 'my-secret',
        secretString: 'SecretString',
        jsonKey: undefined,
        versionStage: 'AWSPREVIOUS',
        versionId: undefined,
      },
      ctx,
    );

    expect(result).toEqual({
      'fn::secret': {
        'fn::invoke': {
          function: 'aws:secretsmanager:getSecretVersion',
          arguments: {
            secretId: 'my-secret',
            versionStage: 'AWSPREVIOUS',
          },
          return: 'secretString',
        },
      },
    });
  });

  test('throws when Secrets Manager references include jsonKey', () => {
    expect(() =>
      serializePropertyValue(
        {
          kind: 'secretsManagerDynamicReference',
          secretId: 'my-secret',
          secretString: 'SecretString',
          jsonKey: 'password',
          versionStage: undefined,
          versionId: undefined,
        },
        ctx,
      ),
    ).toThrow(
      'Secrets Manager dynamic references using jsonKey (password) are not supported in YAML serialization',
    );
  });
});
