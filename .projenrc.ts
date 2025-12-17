import { TypeScriptProject } from '@hallcor/pulumi-projen-project-types';
import { javascript } from 'projen';

const project = new TypeScriptProject({
  defaultReleaseBranch: 'main',
  devDeps: [
    '@hallcor/pulumi-projen-project-types',
    'projen',
    '@types/fs-extra',
    '@types/mock-fs',
  ],
  release: true,
  releaseToNpm: false,
  name: 'cdk2pulumi',
  projenrcTs: true,
  packageManager: javascript.NodePackageManager.NPM,
  deps: [
    'aws-cdk-lib',
    '@aws-cdk/cdk-assets-lib',
    'fs-extra',
    'yaml',
    'mock-fs',
  ],
  workflowBootstrapSteps: [
    {
      uses: 'oven-sh/setup-bun@v2',
    },
  ],

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});

project.addTask('extract-identifiers', {
  exec: 'npx ts-node extract-primary-identifiers.ts',
  description: 'Extracts primary identifiers from aws-native-metadata.json',
});

project.release?.publisher.addGitHubPostPublishingSteps({
  env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' },
  run: 'gh release upload $(cat dist/releasetag.txt) dist/*.tar.gz -R $GITHUB_REPOSITORY',
});

const architectures: string[] = [
  'linux-arm64',
  'darwin-arm64',
  'linux-x64',
  'windows-x64',
  'darwin-x64',
];

architectures.forEach((arch) => {
  const archName = arch.replace('x64', 'amd64');
  const packageTask = project.addTask(`package:${arch}`, {
    steps: [
      {
        exec: `bun build --compile --minify --sourcemap --target bun-${arch} --outfile dist/bin/${arch}/pulumi-tool-cdk2pulumi src/cli/cli-runner.ts schemas/aws-native-metadata.json schemas/primary-identifiers.json`,
      },
      {
        env: {
          VERSION: "$(jq -r '.version' package.json)",
        },
        exec: `tar -czf dist/pulumi-tool-cdk2pulumi-v\${VERSION}-${archName}.tar.gz -C dist/bin/${arch} pulumi-tool-cdk2pulumi${arch.startsWith('windows') ? '.exe' : ''}`,
      },
    ],
  });
  project.packageTask.spawn(packageTask);
});

project.gitignore.include('AGENTS.md');
project.gitignore.exclude(
  'Pulumi.yaml',
  'Pulumi.yaml.report.json',
  'Pulumi.*.yaml',
);
project.synth();
