import {
  ProgramIR,
  ResourceIR,
  StackIR,
  StackAddress,
  PropertyMap,
  PropertyValue,
  ConcatValue,
  ResourceAttributeReference,
  Metadata,
  PulumiProvider,
} from '../core';
import { ConversionReportCollector } from './conversion-report';

export interface PostProcessOptions {
  skipCustomResources?: boolean;
  reportCollector?: ConversionReportCollector;
  /**
   * Optional explicit staging bucket name when not modeled as a resource in the assembly.
   * This mirrors CDK's behavior where the bootstrap bucket name is hard-coded in asset metadata.
   */
  bootstrapBucketName?: string;
}

interface BootstrapBucketRef {
  stackPath?: string;
  logicalId?: string;
  resource?: ResourceIR;
  bucketName?: PropertyValue;
}

export function postProcessProgramIr(
  program: ProgramIR,
  options: PostProcessOptions = {},
): ProgramIR {
  const bootstrapBucket = options.skipCustomResources
    ? undefined
    : findBootstrapBucket(program, options.bootstrapBucketName);
  const metadata = new Metadata(PulumiProvider.AWS_NATIVE);
  return {
    ...program,
    stacks: program.stacks.map((stack) => {
      options.reportCollector?.stackStarted(stack);
      const resources = rewriteResources(
        stack,
        bootstrapBucket,
        metadata,
        options,
      );
      options.reportCollector?.stackFinished(stack, resources.length);
      return {
        ...stack,
        resources,
      };
    }),
  };
}

function rewriteResources(
  stack: StackIR,
  bootstrapBucket: BootstrapBucketRef | undefined,
  metadata: Metadata,
  options: PostProcessOptions = {},
): ResourceIR[] {
  const collector = options.reportCollector;
  const rewritten: ResourceIR[] = [];

  // Second pass: process all resources and merge policies into roles
  for (const resource of stack.resources) {
    if (resource.cfnType === 'AWS::CDK::Metadata') {
      collector?.resourceSkipped(stack, resource, 'cdkMetadata');
      continue;
    }

    if (resource.cfnType === 'AWS::ApiGatewayV2::Stage') {
      const converted = convertApiGatewayV2Stage(resource);
      recordConversionArtifacts(collector, stack, resource, [converted]);
      rewritten.push(converted);
      continue;
    }

    if (resource.cfnType === 'AWS::ServiceDiscovery::Service') {
      const converted = convertServiceDiscoveryService(resource);
      recordConversionArtifacts(collector, stack, resource, [converted]);
      rewritten.push(converted);
      continue;
    }

    if (resource.cfnType === 'AWS::ServiceDiscovery::PrivateDnsNamespace') {
      const converted = convertServiceDiscoveryPrivateDnsNamespace(resource);
      recordConversionArtifacts(collector, stack, resource, [converted]);
      rewritten.push(converted);
      continue;
    }

    if (resource.cfnType === 'AWS::RDS::DBProxyTargetGroup') {
      const converted = convertDbProxyTargetGroup(resource);
      recordConversionArtifacts(collector, stack, resource, converted);
      for (const res of converted) {
        rewritten.push(res);
      }
      continue;
    }

    if (resource.cfnType === 'AWS::IAM::Policy') {
      const converted = convertIamPolicy(resource, stack);
      recordConversionArtifacts(collector, stack, resource, converted);
      for (const res of converted) {
        rewritten.push(res);
      }
      continue;
    }

    if (resource.cfnType === 'AWS::SQS::QueuePolicy') {
      const converted = convertQueuePolicy(resource);
      recordConversionArtifacts(collector, stack, resource, converted);
      for (const res of converted) {
        rewritten.push(res);
      }
      continue;
    }

    if (isCustomResource(resource)) {
      if (options.skipCustomResources) {
        collector?.resourceSkipped(stack, resource, 'customResourceFiltered');
        continue;
      }
      rewritten.push(convertCustomResource(resource, stack, bootstrapBucket));
      continue;
    }

    const rewrittenResource = resource;
    rewritten.push(rewrittenResource);

    if (
      rewrittenResource.typeToken.startsWith('aws-native:') &&
      !isUnsupportedResource(rewrittenResource, metadata)
    ) {
      collector?.success(stack, resource, rewrittenResource.typeToken);
    }
  }

  return filterUnsupportedResources(stack, rewritten, collector, metadata);
}

function recordConversionArtifacts(
  collector: ConversionReportCollector | undefined,
  stack: StackIR,
  source: ResourceIR,
  produced: ResourceIR[],
) {
  if (!collector) {
    return;
  }
  const classicTargets = Array.from(
    new Set(
      produced
        .filter((result) => result.typeToken.startsWith('aws:'))
        .map((result) => result.typeToken),
    ),
  );
  if (classicTargets.length > 0) {
    collector.classicConversion(stack, source, classicTargets);
  }
  if (produced.length > 1) {
    collector.fanOut(stack, source, produced);
  }

  // Also report success for any aws-native resources produced
  for (const res of produced) {
    if (res.typeToken.startsWith('aws-native:')) {
      collector.success(stack, source, res.typeToken);
    }
  }
}

function convertApiGatewayV2Stage(resource: ResourceIR): ResourceIR {
  const props = resource.cfnProperties;
  const stageProps = removeUndefined({
    accessLogSettings: props.AccessLogSettings,
    apiId: props.ApiId,
    autoDeploy: props.AutoDeploy,
    clientCertificateId: props.ClientCertificateId,
    defaultRouteSettings: props.DefaultRouteSettings,
    deploymentId: props.DeploymentId,
    description: props.Description,
    name: props.StageName,
    routeSettings: props.RouteSettings,
    stageVariables: props.StageVariables,
    tags: convertTags(props.Tags),
  });

  return {
    ...resource,
    typeToken: 'aws:apigatewayv2/stage:Stage',
    props: stageProps,
  };
}

function convertServiceDiscoveryService(resource: ResourceIR): ResourceIR {
  const props = resource.cfnProperties;
  const serviceProps = removeUndefined({
    description: props.Description,
    dnsConfig: convertServiceDiscoveryDnsConfig(props.DnsConfig),
    healthCheckConfig: convertServiceDiscoveryHealthCheckConfig(
      props.HealthCheckConfig,
    ),
    healthCheckCustomConfig: convertServiceDiscoveryHealthCheckCustomConfig(
      props.HealthCheckCustomConfig,
    ),
    name: props.Name,
    namespaceId: props.NamespaceId,
    tags: convertTags(props.Tags),
    type: props.Type,
  });

  return {
    ...resource,
    typeToken: 'aws:servicediscovery/service:Service',
    props: serviceProps,
  };
}

function convertServiceDiscoveryPrivateDnsNamespace(
  resource: ResourceIR,
): ResourceIR {
  const props = resource.cfnProperties;
  const namespaceProps = removeUndefined({
    description: props.Description,
    name: props.Name,
    tags: convertTags(props.Tags),
    vpc: props.Vpc,
  });

  return {
    ...resource,
    typeToken: 'aws:servicediscovery/privateDnsNamespace:PrivateDnsNamespace',
    props: namespaceProps,
  };
}

function convertCustomResource(
  resource: ResourceIR,
  stack: StackIR,
  bucket: BootstrapBucketRef | undefined,
): ResourceIR {
  const bucketName = replaceAwsAccountIdIntrinsic(
    resolveBootstrapBucketName(bucket),
  );
  const bucketAddress: StackAddress | undefined =
    bucket?.stackPath && bucket.logicalId
      ? {
          stackPath: bucket.stackPath,
          id: bucket.logicalId,
        }
      : undefined;
  const bucketNameValue =
    bucketName ??
    (bucketAddress
      ? ({
          kind: 'resourceAttribute',
          resource: bucketAddress,
          attributeName: 'Ref',
          propertyName: 'bucketName',
        } satisfies ResourceAttributeReference)
      : undefined);

  const bucketKeyPrefix = `deploy-time/pulumi/custom-resources/${stack.stackId}/${resource.logicalId}`;

  return {
    ...resource,
    typeToken: 'aws-native:cloudformation:CustomResourceEmulator',
    props: removeUndefined({
      bucketName: bucketNameValue,
      bucketKeyPrefix,
      serviceToken: resource.cfnProperties.ServiceToken,
      resourceType: resource.cfnType,
      customResourceProperties: resource.cfnProperties,
      stackId: stack.stackId,
    }),
  };
}

function replaceAwsAccountIdIntrinsic(
  value: PropertyValue | undefined,
): PropertyValue | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'string') {
    return replaceAwsAccountIdInString(value);
  }

  if (isConcatValue(value)) {
    return {
      ...value,
      values: value.values.map(
        (part) => replaceAwsAccountIdIntrinsic(part) ?? part,
      ),
    };
  }

  return value;
}

function replaceAwsAccountIdInString(value: string): PropertyValue {
  const parts = value.split('${AWS::AccountId}');
  if (parts.length === 1) {
    return value;
  }

  const pieces: PropertyValue[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length > 0) {
      pieces.push(part);
    }
    if (i < parts.length - 1) {
      pieces.push(makeAccountIdInvoke());
    }
  }

  return pieces.length === 1
    ? pieces[0]
    : ({
        kind: 'concat',
        delimiter: '',
        values: pieces,
      } satisfies ConcatValue);
}

function makeAccountIdInvoke(): PropertyMap {
  return {
    'fn::invoke': {
      function: 'aws:index/getCallerIdentity:getCallerIdentity',
      arguments: {},
      return: 'accountId',
    },
  };
}

function isConcatValue(value: PropertyValue): value is ConcatValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as any).kind === 'concat'
  );
}

function convertQueuePolicy(resource: ResourceIR): ResourceIR[] {
  const props = resource.props;
  if (!Array.isArray(props.queues)) {
    throw new Error('QueuePolicy has an invalid value for `queues` property');
  }

  const policyDocument =
    resource.cfnProperties.PolicyDocument ??
    (props as PropertyMap).policyDocument;

  return props.queues.flatMap((queue: PropertyValue, idx: number) => {
    const logicalId =
      idx === 0 ? resource.logicalId : `${resource.logicalId}-policy-${idx}`;
    const convertedProps = removeUndefined({
      policy: policyDocument,
      queueUrl: queue,
    });

    return {
      ...resource,
      logicalId,
      typeToken: 'aws:sqs/queuePolicy:QueuePolicy',
      props: convertedProps,
    };
  });
}

function resolveBootstrapBucketName(
  bucket: BootstrapBucketRef | undefined,
): PropertyValue | undefined {
  if (!bucket) {
    return undefined;
  }

  if (bucket.bucketName) {
    return bucket.bucketName;
  }

  const bucketProps = bucket.resource?.props;
  if (
    bucketProps &&
    typeof bucketProps === 'object' &&
    'bucketName' in bucketProps
  ) {
    return (bucketProps as PropertyMap).bucketName;
  }
  return undefined;
}

function convertIamPolicy(resource: ResourceIR, stack: StackIR): ResourceIR[] {
  const props = resource.cfnProperties;
  const roles = Array.isArray(props.Roles) ? props.Roles : [];
  if (roles.length === 0) {
    return [
      {
        ...resource,
        typeToken: 'aws:iam/rolePolicy:RolePolicy',
        props: removeUndefined({
          name:
            typeof props.PolicyName === 'string'
              ? props.PolicyName
              : resource.logicalId,
          policy:
            props.PolicyDocument ?? (resource.props as PropertyMap)?.policy,
        }),
      },
    ];
  }

  return roles.map((roleRef: any, idx: number) => {
    const logicalId =
      idx === 0 ? resource.logicalId : `${resource.logicalId}-${idx}`;
    const roleName = convertRoleReferenceToRoleIdentifier(roleRef, stack);
    return {
      ...resource,
      logicalId,
      typeToken: 'aws:iam/rolePolicy:RolePolicy',
      props: removeUndefined({
        name:
          typeof props.PolicyName === 'string'
            ? props.PolicyName
            : resource.logicalId,
        policy: props.PolicyDocument ?? (resource.props as PropertyMap)?.policy,
        role: roleName,
      }),
    };
  });
}

function convertRoleReferenceToRoleIdentifier(
  roleRef: any,
  stack: StackIR,
): PropertyValue | undefined {
  if (typeof roleRef === 'string') {
    return roleRef;
  }

  if (roleRef && typeof roleRef === 'object') {
    if ('resource' in roleRef && roleRef.resource) {
      const res = roleRef.resource as any;
      return {
        kind: 'resourceAttribute',
        resource: { stackPath: res.stackPath ?? stack.stackPath, id: res.id },
        attributeName: 'roleName',
      } satisfies ResourceAttributeReference;
    }
    if ('Ref' in roleRef && typeof roleRef.Ref === 'string') {
      return {
        kind: 'resourceAttribute',
        resource: { stackPath: stack.stackPath, id: roleRef.Ref },
        attributeName: 'roleName',
      } satisfies ResourceAttributeReference;
    }
  }

  return undefined;
}

function convertTags(tags: PropertyValue | undefined): PropertyMap | undefined {
  if (!Array.isArray(tags)) {
    return undefined;
  }
  const result: PropertyMap = {};
  for (const tag of tags) {
    if (typeof tag !== 'object' || tag === null) {
      continue;
    }
    const key = (tag as PropertyMap).Key ?? (tag as PropertyMap).key;
    const value = (tag as PropertyMap).Value ?? (tag as PropertyMap).value;
    if (typeof key !== 'string' || value === undefined) {
      continue;
    }
    result[key] = value as PropertyValue;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function convertDbProxyTargetGroup(resource: ResourceIR): ResourceIR[] {
  const props = resource.cfnProperties;
  const dbProxyName = props.DBProxyName;
  const targetGroupName = props.TargetGroupName ?? 'default';
  const connectionPoolConfig = props.ConnectionPoolConfigurationInfo;

  const converted: ResourceIR[] = [];

  converted.push({
    ...resource,
    typeToken: 'aws:rds/proxyDefaultTargetGroup:ProxyDefaultTargetGroup',
    props: removeUndefined({
      connectionPoolConfig,
      dbProxyName,
    }),
  });

  const addTargets = (
    ids: PropertyValue | undefined,
    kind: 'cluster' | 'instance',
  ) => {
    if (!Array.isArray(ids)) {
      return;
    }
    ids.forEach((id, idx) => {
      if (typeof id !== 'string') {
        return;
      }
      const logicalId =
        idx === 0
          ? `${resource.logicalId}-${kind}`
          : `${resource.logicalId}-${kind}-${idx + 1}`;
      converted.push({
        ...resource,
        logicalId,
        typeToken: 'aws:rds/proxyTarget:ProxyTarget',
        props: removeUndefined({
          dbProxyName,
          targetGroupName,
          dbClusterIdentifier: kind === 'cluster' ? id : undefined,
          dbInstanceIdentifier: kind === 'instance' ? id : undefined,
        }),
      });
    });
  };

  addTargets(props.DBClusterIdentifiers, 'cluster');
  addTargets(props.DBInstanceIdentifiers, 'instance');

  return converted;
}

function convertServiceDiscoveryDnsConfig(
  value: PropertyValue | undefined,
): PropertyMap | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const config = value as PropertyMap;
  const dnsRecords = convertServiceDiscoveryDnsRecords(config.DnsRecords);
  const converted = removeUndefined({
    dnsRecords,
    namespaceId: config.NamespaceId,
    routingPolicy: config.RoutingPolicy,
  });
  return Object.keys(converted).length > 0 ? converted : undefined;
}

function convertServiceDiscoveryDnsRecords(
  value: PropertyValue | undefined,
): PropertyValue | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const records = value
    .map((record) => {
      if (typeof record !== 'object' || record === null) {
        return undefined;
      }
      const recordMap = record as PropertyMap;
      const converted = removeUndefined({
        ttl: (recordMap.TTL ?? recordMap.Ttl ?? recordMap.ttl) as
          | PropertyValue
          | undefined,
        type: recordMap.Type,
      });
      return Object.keys(converted).length > 0 ? converted : undefined;
    })
    .filter((record): record is PropertyMap => record !== undefined);
  return records.length > 0 ? (records as PropertyValue) : undefined;
}

function convertServiceDiscoveryHealthCheckConfig(
  value: PropertyValue | undefined,
): PropertyMap | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const config = value as PropertyMap;
  const converted = removeUndefined({
    failureThreshold: config.FailureThreshold,
    resourcePath: config.ResourcePath,
    type: config.Type,
  });
  return Object.keys(converted).length > 0 ? converted : undefined;
}

function convertServiceDiscoveryHealthCheckCustomConfig(
  value: PropertyValue | undefined,
): PropertyMap | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const config = value as PropertyMap;
  const converted = removeUndefined({
    failureThreshold: config.FailureThreshold,
  });
  return Object.keys(converted).length > 0 ? converted : undefined;
}

function removeUndefined(
  values: Record<string, PropertyValue | undefined>,
): PropertyMap {
  const result: PropertyMap = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function isCustomResource(resource: ResourceIR): boolean {
  return (
    resource.cfnType === 'AWS::CloudFormation::CustomResource' ||
    resource.cfnType.startsWith('Custom::')
  );
}

function filterUnsupportedResources(
  stack: StackIR,
  resources: ResourceIR[],
  collector: ConversionReportCollector | undefined,
  metadata: Metadata,
): ResourceIR[] {
  const supported: ResourceIR[] = [];
  for (const resource of resources) {
    if (isUnsupportedResource(resource, metadata)) {
      collector?.unsupportedType(
        stack,
        resource,
        'Type not found in aws-native metadata',
      );
      continue;
    }
    supported.push(resource);
  }
  return supported;
}

function isUnsupportedResource(
  resource: ResourceIR,
  metadata: Metadata,
): boolean {
  if (!resource.typeToken.startsWith('aws-native:')) {
    return false;
  }

  // Synthetic emulator should always be allowed even though it has no metadata entry
  if (
    resource.typeToken === 'aws-native:cloudformation:CustomResourceEmulator'
  ) {
    return false;
  }

  return metadata.tryFindResource(resource.cfnType) === undefined;
}

function findBootstrapBucket(
  program: ProgramIR,
  bucketNameOverride?: string,
): BootstrapBucketRef | undefined {
  if (bucketNameOverride) {
    return { bucketName: bucketNameOverride };
  }

  const prioritized = program.stacks.filter((stack) =>
    /StagingStack|CDKToolkit|BootstrapStack/i.test(stack.stackId),
  );
  const stacksToSearch = prioritized.length > 0 ? prioritized : program.stacks;
  for (const stack of stacksToSearch) {
    const bucket = stack.resources.find(
      (res) =>
        res.cfnType === 'AWS::S3::Bucket' && looksLikeBootstrapBucket(res),
    );
    if (bucket) {
      return {
        stackPath: stack.stackPath,
        logicalId: bucket.logicalId,
        resource: bucket,
      };
    }
  }
  return undefined;
}

function looksLikeBootstrapBucket(resource: ResourceIR): boolean {
  const id = resource.logicalId.toLowerCase();
  if (id.includes('stagingbucket') || id.includes('staging-bucket')) {
    return true;
  }
  if (id.includes('cdktoolkit') || id.includes('toolkit')) {
    return true;
  }
  const bucketName = (resource.props as PropertyMap)?.bucketName;
  if (typeof bucketName === 'string' && /cdk-.*-staging/i.test(bucketName)) {
    return true;
  }
  return false;
}
