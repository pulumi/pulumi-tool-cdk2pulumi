import { ConstructKind } from './types';

const AWS_CDK_PREFIX = 'aws-cdk-lib.';
const CONSTRUCTS_PREFIX = 'constructs.';

/**
 * Classifies a construct fully qualified name into a coarse grain bucket used by
 * the report.
 */
export function classifyConstructFqn(fqn?: string): ConstructKind {
  if (!fqn) {
    return 'unknown';
  }

  if (fqn.startsWith(AWS_CDK_PREFIX)) {
    if (isCustomResourceFqn(fqn)) {
      return 'customResource';
    }
    if (isL1Construct(fqn)) {
      return 'l1';
    }
    return 'coreL2';
  }

  if (fqn.startsWith(CONSTRUCTS_PREFIX)) {
    return 'userDefined';
  }

  if (fqn.includes('.')) {
    return 'thirdParty';
  }

  return 'unknown';
}

export function isCustomResourceFqn(fqn: string): boolean {
  return fqn.includes('.CustomResource') || fqn.includes('.custom_resources');
}

function isL1Construct(fqn: string): boolean {
  return /\.Cfn[A-Z]/.test(fqn);
}
