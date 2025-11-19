import { parseEnvironmentTarget } from '../../src/core/analysis';

describe('parseEnvironmentTarget', () => {
  it('returns parsed account and region for valid targets', () => {
    expect(parseEnvironmentTarget('aws://123456789012/us-west-2')).toEqual({
      original: 'aws://123456789012/us-west-2',
      account: '123456789012',
      region: 'us-west-2',
      isUnknown: false,
    });
  });

  it('flags missing environment strings', () => {
    expect(parseEnvironmentTarget()).toEqual({
      isUnknown: true,
      notes: ['Environment target missing from artifact'],
    });
  });

  it('records placeholder account usage', () => {
    expect(parseEnvironmentTarget('aws://unknown-account/us-east-1')).toEqual({
      original: 'aws://unknown-account/us-east-1',
      account: undefined,
      region: 'us-east-1',
      isUnknown: true,
      notes: [
        'Manifest environment uses placeholder "unknown-account" for account',
      ],
    });
  });

  it('records placeholder region usage', () => {
    expect(parseEnvironmentTarget('aws://123456789012/unknown-region')).toEqual(
      {
        original: 'aws://123456789012/unknown-region',
        account: '123456789012',
        region: undefined,
        isUnknown: true,
        notes: [
          'Manifest environment uses placeholder "unknown-region" for region',
        ],
      },
    );
  });

  it('records invalid formats', () => {
    expect(parseEnvironmentTarget('not-an-env')).toEqual({
      original: 'not-an-env',
      isUnknown: true,
      notes: ['Failed to match aws://ACCOUNT/REGION pattern'],
    });
  });
});
