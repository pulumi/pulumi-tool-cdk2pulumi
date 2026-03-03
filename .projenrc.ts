import { TypeScriptProject } from '@hallcor/pulumi-projen-project-types';
import { AiInstructions, javascript, Project, TextFile } from 'projen';

const project = new TypeScriptProject({
  defaultReleaseBranch: 'main',
  devDeps: [
    '@hallcor/pulumi-projen-project-types',
    'projen',
    '@types/fs-extra',
    '@types/mock-fs',
    'mock-fs',
    '@aws-cdk/toolkit-lib',
  ],
  release: true,
  releaseToNpm: false,
  name: 'cdk2pulumi',
  projenrcTs: true,
  packageManager: javascript.NodePackageManager.NPM,
  pullRequestTemplateContents: [
    '## Summary',
    '',
    '- What changed?',
    '- Why was it needed?',
    '- Link issue/spec/task.',
    '',
    'Fixes #',
    '',
    '## Validation',
    '',
    '- [ ] `npx projen compile`',
    '- [ ] `npx projen test:unit`',
    '- [ ] `npx projen test:integration` (required for CLI/analyzer behavior changes)',
    '- [ ] `npx projen build` (recommended before merge)',
    '',
    'Paste relevant output snippets (or explain why not run):',
    '',
    '```text',
    '<command output>',
    '```',
    '',
    '## Risk & Blast Radius',
    '',
    '- Primary risk:',
    '- Affected modules/files:',
    '- User-visible behavior changes:',
    '',
    '## Rollback Plan',
    '',
    '- How to revert quickly if regression is found.',
    '',
    '## Checklist',
    '',
    '- [ ] No manual edits to Projen-generated files (or `.projenrc.ts` updated + `npx projen` run)',
    '- [ ] Specs/docs updated where behavior or workflow changed',
    '- [ ] Tests added or updated for behavior changes',
  ],
  deps: ['aws-cdk-lib', '@aws-cdk/cdk-assets-lib', 'fs-extra', 'yaml'],
  workflowBootstrapSteps: [
    {
      uses: 'oven-sh/setup-bun@v2',
    },
  ],
  tsconfig: {
    compilerOptions: {
      target: 'es2022',
      lib: ['es2022', 'esnext.disposable'],
    },
  },
  tsconfigDev: {
    compilerOptions: {
      target: 'es2022',
      lib: ['es2022', 'esnext.disposable'],
    },
  },

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});

const projenProject = Project.of(project);
new TextFile(project, 'INSTRUCTIONS.md', {
  lines: [
    AiInstructions.projen(projenProject),
    AiInstructions.bestPractices(projenProject),
  ],
});

project.addTask('extract-identifiers', {
  exec: 'npx ts-node extract-primary-identifiers.ts',
  description: 'Extracts primary identifiers from aws-native-metadata.json',
});

project.addTask('test:unit', {
  exec: 'npx jest --collectCoverage=false --testPathIgnorePatterns="\\.integration\\.test\\.ts$|\\.synth\\.test\\.ts$"',
  description: 'Runs fast unit tests only (skips integration/synth tests).',
});

project.addTask('test:unit:watch', {
  exec: 'npx jest --collectCoverage=false --watch --testPathIgnorePatterns="\\.integration\\.test\\.ts$|\\.synth\\.test\\.ts$"',
  description: 'Watches fast unit tests only (skips integration/synth tests).',
});

project.addTask('test:integration', {
  exec: 'npx jest --collectCoverage=false --testPathPatterns="(\\.integration|\\.synth)\\.test\\.ts$"',
  description: 'Runs integration and synth tests only.',
});

project.addTask('lint:check', {
  env: { ESLINT_USE_FLAT_CONFIG: 'false' },
  exec: 'eslint --ext .ts,.tsx --no-error-on-unmatched-pattern src test build-tools projenrc .projenrc.ts',
  description: 'Runs eslint without applying fixes.',
});

project.addTask('test:unit:ci', {
  exec: 'npx jest --ci --collectCoverage=false --testPathIgnorePatterns="\\.integration\\.test\\.ts$|\\.synth\\.test\\.ts$"',
  description: 'Runs non-mutating unit tests for CI/PR validation.',
});

project.addTask('verify:ai', {
  description: 'Runs non-mutating checks for AI-assisted contributions.',
  steps: [
    { spawn: 'compile' },
    { spawn: 'lint:check' },
    { spawn: 'test:unit:ci' },
  ],
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
  '.claude/settings.local.json',
  'Pulumi.yaml',
  'Pulumi.yaml.report.json',
  'Pulumi.*.yaml',
  'test/**/cdk.out',
);
project.synth();
