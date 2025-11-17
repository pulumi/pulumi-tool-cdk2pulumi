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
project.synth();
