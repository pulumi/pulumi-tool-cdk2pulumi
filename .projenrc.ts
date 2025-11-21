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
  release: false,
  name: 'pulumi-cdk-convert',
  projenrcTs: true,
  packageManager: javascript.NodePackageManager.NPM,
  deps: [
    'aws-cdk-lib',
    '@aws-cdk/cdk-assets-lib',
    'fs-extra',
    'yaml',
    'mock-fs',
  ],

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});

project.addTask('extract-identifiers', {
  exec: 'npx ts-node extract-primary-identifiers.ts',
  description: 'Extracts primary identifiers from aws-native-metadata.json',
});

const packageLinuxArm = project.addTask('package:linux:arm', {
  exec: 'bun build --compile --minify --sourcemap --target bun-linux-arm64 --outfile dist/bin/linux-arm64/cdk2pulumi src/cli/cli-runner.ts schemas/aws-native-metadata.json',
});
const packageMacos = project.addTask('package:macos:arm', {
  exec: 'bun build --compile --minify --sourcemap --target bun-macos-arm64 --outfile dist/bin/macos-arm64/cdk2pulumi src/cli/cli-runner.ts schemas/aws-native-metadata.json',
});
project.packageTask.spawn(packageLinuxArm);
project.packageTask.spawn(packageMacos);

project.gitignore.include('AGENTS.md');
project.gitignore.exclude('Pulumi.yaml');
project.gitignore.exclude('Pulumi.yaml.report.json');
project.synth();
