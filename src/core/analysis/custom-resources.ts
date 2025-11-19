import { StackManifest } from '../assembly';
import { AssetLookup } from './assets';
import { CustomResourceUsageSummary } from './types';

/**
 * Analyzes custom resources across all stacks to extract implementation details.
 */
export function analyzeCustomResources(
  stacks: StackManifest[],
  assetLookup: AssetLookup,
): CustomResourceUsageSummary[] {
  const results: CustomResourceUsageSummary[] = [];

  for (const stack of stacks) {
    for (const [stackPath, template] of Object.entries(stack.stacks)) {
      for (const [logicalId, resource] of Object.entries(
        template.Resources ?? {},
      )) {
        const type = resource.Type;
        if (
          !type ||
          (!type.startsWith('Custom::') &&
            type !== 'AWS::CloudFormation::CustomResource')
        ) {
          continue;
        }

        const serviceToken = resource.Properties?.ServiceToken;
        let handler: string | undefined;
        let assetPath: string | undefined;

        const tokenRef = resolveServiceTokenRef(serviceToken);
        if (tokenRef) {
          const targetResource = stack.resourceWithLogicalId(
            stackPath,
            tokenRef,
          );
          if (
            targetResource &&
            targetResource.Type === 'AWS::Lambda::Function'
          ) {
            handler = targetResource.Properties?.Handler;
            // Check for asset metadata on the Lambda resource
            const lambdaMetadata = targetResource.Metadata;
            assetPath = lambdaMetadata?.['aws:asset:path'];
          }
        }

        // If we found an asset path, try to look up details
        if (assetPath) {
          const details = assetLookup(assetPath);
          if (details) {
            // We could enrich the result with more details here if needed
          }
        }

        results.push({
          type,
          stackId: stack.id,
          logicalId,
          serviceToken:
            typeof serviceToken === 'string' ? serviceToken : undefined,
          handler,
          assetPath,
        });
      }
    }
  }

  return results;
}

function resolveServiceTokenRef(serviceToken: any): string | undefined {
  if (typeof serviceToken === 'string') {
    return undefined; // It's a literal ARN, not a reference we can trace in the stack
  }

  if (typeof serviceToken === 'object' && serviceToken !== null) {
    if ('Fn::GetAtt' in serviceToken) {
      const getAtt = serviceToken['Fn::GetAtt'];
      if (Array.isArray(getAtt) && getAtt.length > 0) {
        return getAtt[0];
      }
    }
    if ('Ref' in serviceToken) {
      return serviceToken.Ref;
    }
  }
  return undefined;
}
