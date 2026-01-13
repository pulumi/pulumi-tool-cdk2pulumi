#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { NeoCdkExampleStack } from '../lib/neo-cdk-example-stack';

const app = new cdk.App();

const env = {
  account: '123456789123',
  region: 'us-east-2',
};

// Dev stack
new NeoCdkExampleStack(app, 'NeoExample-Dev', {
  env,
  stage: 'dev',
});

// Staging stack
// new NeoCdkExampleStack(app, 'NeoExample-Stg', {
//   env,
//   stage: 'stg',
// });
