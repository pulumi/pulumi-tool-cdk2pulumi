import * as cdk from 'aws-cdk-lib';
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
});
