import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { parse } from 'yaml';
import { synthesizeAndConvert } from './helpers';
import { serializeProgramIr } from '../../src/cli/ir-to-yaml';

const INTEGRATION_TIMEOUT = 60000;

describe('Synthesis intrinsics to YAML', () => {
  let yamlDoc: any;

  beforeAll(async () => {
    const program = await synthesizeAndConvert(() => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');

      const stage = new cdk.CfnParameter(stack, 'Stage', {
        type: 'String',
        default: 'dev',
      });

      const regionMap = new cdk.CfnMapping(stack, 'RegionMap', {
        mapping: {
          dev: {
            Ami: 'ami-123',
          },
        },
      });

      new cdk.CfnCondition(stack, 'IsProd', {
        expression: cdk.Fn.conditionEquals(stage.valueAsString, 'prod'),
      });

      const bucket = new s3.CfnBucket(stack, 'Bucket', {
        bucketName: cdk.Fn.join('-', ['data', stage.valueAsString]),
      });

      bucket.addPropertyOverride('Tags', [
        {
          Key: 'Ami',
          Value: regionMap.findInMap('dev', 'Ami'),
        },
        {
          Key: 'Stage',
          Value: cdk.Fn.conditionIf('IsProd', 'prod', 'dev'),
        },
      ]);

      return app;
    });

    yamlDoc = parse(serializeProgramIr(program));
  }, INTEGRATION_TIMEOUT);

  test('serializes joins using parameter defaults', () => {
    const bucket = yamlDoc.resources.bucket;
    expect(bucket.properties.bucketName).toEqual({
      'fn::join': ['-', ['data', 'dev']],
    });
  });

  test('resolves FindInMap values during conversion', () => {
    const bucket = yamlDoc.resources.bucket;
    expect(bucket.properties.tags[0]).toEqual({
      key: 'Ami',
      value: 'ami-123',
    });
  });

  test('evaluates conditions during conversion', () => {
    const bucket = yamlDoc.resources.bucket;
    expect(bucket.properties.tags[1]).toEqual({
      key: 'Stage',
      value: 'dev',
    });
  });

  test(
    'serializes dual-stack IPv6 cidr flows through invoke and select',
    async () => {
      const program = await synthesizeAndConvert(() => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'DualStack');

        const vpc = new ec2.CfnVPC(stack, 'Vpc', {
          cidrBlock: '10.0.0.0/16',
        });

        const ipv6Cidr = new ec2.CfnVPCCidrBlock(stack, 'VpcIpv6Cidr', {
          amazonProvidedIpv6CidrBlock: true,
          vpcId: vpc.ref,
        });

        const subnet = new ec2.CfnSubnet(stack, 'Subnet', {
          vpcId: vpc.ref,
          cidrBlock: '10.0.0.0/24',
          availabilityZone: 'us-east-1a',
          ipv6CidrBlock: cdk.Fn.select(
            0,
            cdk.Fn.cidr(cdk.Fn.select(0, vpc.attrIpv6CidrBlocks), 256, '64'),
          ),
        });
        subnet.addDependency(ipv6Cidr);

        return app;
      });

      const dualStackYaml = parse(serializeProgramIr(program));
      expect(dualStackYaml.resources.Subnet.properties.ipv6CidrBlock).toEqual({
        'fn::select': [
          0,
          {
            'fn::invoke': {
              function: 'aws-native:cidr',
              arguments: {
                ipBlock: {
                  'fn::select': [0, '${Vpc.ipv6CidrBlocks}'],
                },
                count: 256,
                cidrBits: 64,
              },
              return: 'subnets',
            },
          },
        ],
      });
    },
    INTEGRATION_TIMEOUT,
  );
});
