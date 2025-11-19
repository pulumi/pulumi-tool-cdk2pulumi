import { StackManifest } from '../assembly';
import { LambdaFunctionSummary } from './types';

/**
 * Analyzes Lambda functions across all stacks to extract implementation details.
 */
export function analyzeLambdaFunctions(
  stacks: StackManifest[],
): LambdaFunctionSummary[] {
  const results: LambdaFunctionSummary[] = [];

  for (const stack of stacks) {
    for (const template of Object.values(stack.stacks)) {
      for (const [logicalId, resource] of Object.entries(
        template.Resources ?? {},
      )) {
        if (resource.Type !== 'AWS::Lambda::Function') {
          continue;
        }

        const props = resource.Properties || {};
        const metadata = resource.Metadata || {};

        // Extract asset path if available
        const assetPath = metadata['aws:asset:path'];

        results.push({
          stackId: stack.id,
          logicalId,
          runtime: props.Runtime,
          handler: props.Handler,
          assetPath: typeof assetPath === 'string' ? assetPath : undefined,
          // constructPath is hard to derive purely from the resource without the tree
          // but we might be able to map it later if needed. For now, leave undefined.
        });
      }
    }
  }

  return results;
}
