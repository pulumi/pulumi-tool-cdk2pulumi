import { EnvironmentSummary, EnvironmentTarget, StackSummary } from './types';

/**
 * Parses a CDK environment identifier (e.g. aws://123456789/us-west-2).
 */
export function parseEnvironmentTarget(
  environment?: string,
): EnvironmentTarget {
  if (!environment) {
    return withNotes({ isUnknown: true }, [
      'Environment target missing from artifact',
    ]);
  }

  const normalized = environment.trim();
  const match = normalized.match(
    /^aws:\/\/(?<account>[^/]+)\/(?<region>[^/]+)$/,
  );
  if (!match || !match.groups) {
    return withNotes(
      {
        original: environment,
        isUnknown: true,
      },
      ['Failed to match aws://ACCOUNT/REGION pattern'],
    );
  }

  const notes: string[] = [];
  const account = sanitizeUnknown(match.groups.account, 'account', notes);
  const region = sanitizeUnknown(match.groups.region, 'region', notes);

  return withNotes(
    {
      original: environment,
      account,
      region,
      isUnknown: !account || !region,
    },
    notes,
  );
}

export function summarizeEnvironments(
  stacks: StackSummary[],
): EnvironmentSummary[] {
  const result = new Map<string, EnvironmentSummary>();

  for (const stack of stacks) {
    const key = deriveEnvironmentKey(stack.environment);
    const current = result.get(key);
    if (!current) {
      result.set(key, {
        id: key,
        target: stack.environment ?? { isUnknown: true },
        stackIds: [stack.id],
      });
      continue;
    }
    current.stackIds.push(stack.id);
  }

  return Array.from(result.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function deriveEnvironmentKey(env?: EnvironmentTarget): string {
  if (!env) {
    return 'unknown';
  }
  if (env.original) {
    return env.original;
  }
  if (env.isUnknown) {
    return 'unknown';
  }
  const account = env.account ?? 'unknown-account';
  const region = env.region ?? 'unknown-region';
  return `aws://${account}/${region}`;
}

function sanitizeUnknown(
  value: string | undefined,
  field: 'account' | 'region',
  notes: string[],
): string | undefined {
  if (!value) {
    notes.push(`Manifest environment missing ${field} component`);
    return undefined;
  }
  if (value === 'unknown-account' && field === 'account') {
    notes.push(
      'Manifest environment uses placeholder "unknown-account" for account',
    );
    return undefined;
  }
  if (value === 'unknown-region' && field === 'region') {
    notes.push(
      'Manifest environment uses placeholder "unknown-region" for region',
    );
    return undefined;
  }
  return value;
}

function withNotes(
  target: EnvironmentTarget,
  notes: string[],
): EnvironmentTarget {
  if (notes.length === 0) {
    return target;
  }
  return {
    ...target,
    notes,
  };
}
