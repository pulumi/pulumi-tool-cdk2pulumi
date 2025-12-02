import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { parse } from 'yaml';
import { runCliWithOptions } from '../../src/cli/cli-runner';

describe('partial stack conversion integration', () => {
  test('emits config placeholders and reports external config when producer stack is omitted', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulumi-partial-'));
    const assemblyDir = path.join(tmpDir, 'assembly');
    fs.ensureDirSync(assemblyDir);

    const outFile = path.join(tmpDir, 'Pulumi.yaml');
    const reportFile = path.join(tmpDir, 'report.json');

    writeMinimalAssembly(assemblyDir);

    try {
      runCliWithOptions({
        assemblyDir,
        outFile,
        skipCustomResources: false,
        stackFilters: ['ConsumerStack'],
        stage: undefined,
        reportFile,
      });

      const yaml = parse(fs.readFileSync(outFile, 'utf8'));
      expect(yaml.resources.Topic.properties.sourceArn).toBe(
        '${external.ProducerStack.BucketArn}',
      );

      const report = fs.readJSONSync(reportFile);
      expect(report.externalConfigRequirements).toEqual([
        {
          consumerStackId: 'ConsumerStack',
          consumerStackPath: 'ConsumerStack',
          resourceLogicalId: 'Topic',
          propertyPath: 'sourceArn',
          sourceStackPath: 'ProducerStack',
          outputName: 'BucketArn',
          configKey: 'external.ProducerStack.BucketArn',
        },
      ]);
    } finally {
      fs.removeSync(tmpDir);
    }
  });
});

function writeMinimalAssembly(dir: string) {
  const manifest = {
    version: '36.0.0',
    artifacts: {
      ProducerStack: {
        type: 'aws:cloudformation:stack',
        environment: 'aws://123456789012/us-east-1',
        properties: {
          templateFile: 'ProducerStack.template.json',
        },
      },
      ConsumerStack: {
        type: 'aws:cloudformation:stack',
        environment: 'aws://123456789012/us-east-1',
        properties: {
          templateFile: 'ConsumerStack.template.json',
        },
        dependencies: ['ProducerStack'],
      },
    },
  };

  const tree = {
    version: 'tree-0.1',
    tree: {
      id: 'App',
      path: 'App',
      children: {
        ProducerStack: {
          id: 'ProducerStack',
          path: 'ProducerStack',
        },
        ConsumerStack: {
          id: 'ConsumerStack',
          path: 'ConsumerStack',
        },
      },
    },
  };

  const producerTemplate = {
    Resources: {
      Bucket: {
        Type: 'AWS::S3::Bucket',
        Properties: {},
      },
    },
    Outputs: {
      BucketArn: {
        Value: {
          'Fn::GetAtt': ['Bucket', 'Arn'],
        },
        Export: {
          Name: 'Producer:BucketArn',
        },
      },
    },
  };

  const consumerTemplate = {
    Resources: {
      Topic: {
        Type: 'AWS::SNS::Topic',
        Properties: {
          SourceArn: {
            'Fn::ImportValue': 'Producer:BucketArn',
          },
        },
      },
    },
  };

  fs.writeJSONSync(path.join(dir, 'manifest.json'), manifest, { spaces: 2 });
  fs.writeJSONSync(path.join(dir, 'tree.json'), tree, { spaces: 2 });
  fs.writeJSONSync(
    path.join(dir, 'ProducerStack.template.json'),
    producerTemplate,
    { spaces: 2 },
  );
  fs.writeJSONSync(
    path.join(dir, 'ConsumerStack.template.json'),
    consumerTemplate,
    { spaces: 2 },
  );
}
