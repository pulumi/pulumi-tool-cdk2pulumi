import { TypeScriptProject } from '@hallcor/pulumi-projen-project-types';
const project = new TypeScriptProject({
  defaultReleaseBranch: 'main',
  devDeps: ['@hallcor/pulumi-projen-project-types'],
  name: 'pulumi-cdk-convert',
  projenrcTs: true,

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();
