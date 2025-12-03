import {
  lookupIdentifier,
  renderIdentifiers,
} from '../../src/cli/identifier-help';

describe('renderIdentifiers finding ID hints', () => {
  test('single-part identifiers suggest the PhysicalResourceId', () => {
    const info = lookupIdentifier('AWS::ACMPCA::CertificateAuthority')[0];
    const rendered = renderIdentifiers(
      [info],
      'AWS::ACMPCA::CertificateAuthority',
    );

    expect(rendered).toContain(
      'Finding the ID: Try the CloudFormation PhysicalResourceId',
    );
  });

  test('composite identifiers surface cloudcontrol listing command', () => {
    const info = lookupIdentifier('AWS::ACMPCA::Permission')[0];
    const rendered = renderIdentifiers([info]);

    expect(rendered).toContain(
      'Finding the ID: aws cloudcontrol list-resources --type-name AWS::ACMPCA::Permission',
    );
    expect(rendered).not.toContain('--resource-model');
  });

  test('required list handler properties are reflected in the command', () => {
    const info = lookupIdentifier(
      'AWS::ApplicationAutoScaling::ScalingPolicy',
    )[0];
    const rendered = renderIdentifiers([info]);

    expect(rendered).toContain(
      'Finding the ID: aws cloudcontrol list-resources --type-name AWS::ApplicationAutoScaling::ScalingPolicy --resource-model \'{"ServiceNamespace": "<VALUE>"}\'',
    );
  });
});
