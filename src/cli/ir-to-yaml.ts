import { stringify } from 'yaml';
import {
  ProgramIR,
  PropertyMap,
  PropertyValue,
  ResourceIR,
  StackAddress,
} from '../core';
import { ConversionReportCollector } from './conversion-report';
import {
  PropertySerializationContext,
  serializePropertyValue,
} from './property-serializer';

const DEFAULT_PROJECT_NAME = 'cdk-converted';

interface PulumiYamlDocument {
  name: string;
  runtime: string;
  resources: Record<string, PulumiYamlResource>;
  config?: Record<string, PulumiYamlConfigEntry>;
}

interface PulumiYamlResource {
  type: string;
  properties?: Record<string, unknown>;
  options?: PulumiYamlResourceOptions;
}

interface PulumiYamlResourceOptions {
  dependsOn?: string[];
  protect?: boolean;
}

interface PulumiYamlConfigEntry {
  type?: string;
  default?: any;
  secret?: boolean;
}

export function serializeProgramIr(
  program: ProgramIR,
  options?: { externalConfigCollector?: ConversionReportCollector },
): string {
  const resourceNames = new ResourceNameAllocator(program);
  const parameterDefaults = collectParameterDefaults(program);
  const stackOutputs = collectStackOutputs(program);
  const includedStackPaths = new Set(
    program.stacks.map((stack) => stack.stackPath),
  );
  const externalConfigCollector = options?.externalConfigCollector;
  const externalConfigKeys = new Set<string>();
  const externalStackOutputName = (stackPath: string, outputName: string) =>
    formatConfigVariable(formatExternalConfigKey(stackPath, outputName));

  const ctx: PropertySerializationContext = {
    getResourceName: (address) => resourceNames.getName(address),
    getStackOutputName: (stackPath, outputName) =>
      externalStackOutputName(stackPath, outputName),
    getParameterDefault: (stackPath, parameterName) =>
      parameterDefaults.get(parameterKey(stackPath, parameterName)),
  };

  const document: PulumiYamlDocument = {
    name: DEFAULT_PROJECT_NAME,
    runtime: 'yaml',
    resources: buildResourceMap(
      program,
      resourceNames,
      ctx,
      stackOutputs,
      includedStackPaths,
      externalConfigCollector,
      externalConfigKeys,
    ),
  };

  if (externalConfigKeys.size > 0) {
    document.config = Object.fromEntries(
      Array.from(externalConfigKeys.values()).map((key) => [
        key,
        { type: 'string' } satisfies PulumiYamlConfigEntry,
      ]),
    );
  }

  return stringify(document, {
    lineWidth: 0,
  });
}

function buildResourceMap(
  program: ProgramIR,
  names: ResourceNameAllocator,
  ctx: PropertySerializationContext,
  stackOutputs: Map<string, PropertyValue>,
  includedStackPaths?: Set<string>,
  externalConfigCollector?: ConversionReportCollector,
  externalConfigKeys?: Set<string>,
): Record<string, PulumiYamlResource> {
  const resources: Record<string, PulumiYamlResource> = {};

  for (const stack of program.stacks) {
    for (const resource of stack.resources) {
      const name = names.getName({
        id: resource.logicalId,
        stackPath: stack.stackPath,
      });
      if (!name) {
        throw new Error(
          `Failed to allocate name for ${stack.stackPath}/${resource.logicalId}`,
        );
      }

      const serializedProps = serializeResourceProperties(
        resource.props,
        ctx,
        stackOutputs,
        includedStackPaths,
        externalConfigCollector,
        stack,
        resource.logicalId,
        externalConfigKeys,
      );
      const options = serializeResourceOptions(resource, names);

      const resourceBlock: PulumiYamlResource = {
        type: resource.typeToken,
      };

      if (serializedProps && Object.keys(serializedProps).length > 0) {
        resourceBlock.properties = serializedProps;
      }

      if (options) {
        resourceBlock.options = options;
      }

      resources[name] = resourceBlock;
    }
  }

  return resources;
}

function serializeResourceProperties(
  props: PropertyMap,
  ctx: PropertySerializationContext,
  stackOutputs: Map<string, PropertyValue>,
  includedStackPaths: Set<string> | undefined,
  externalConfigCollector: ConversionReportCollector | undefined,
  stack: { stackId: string; stackPath: string },
  resourceLogicalId: string,
  externalConfigKeys: Set<string> | undefined,
) {
  const resolvedProps = resolveStackOutputReferences(props as PropertyValue, {
    stackOutputs,
    includedStackPaths,
    onMissingStackOutput: externalConfigCollector
      ? (ref, path) => {
          const configKey = formatExternalConfigKey(
            ref.stackPath,
            ref.outputName,
          );
          externalConfigKeys?.add(configKey);
          externalConfigCollector.externalConfigRequirement({
            consumerStackId: stack.stackId,
            consumerStackPath: stack.stackPath,
            resourceLogicalId,
            propertyPath: formatPropertyPath(path),
            sourceStackPath: ref.stackPath,
            outputName: ref.outputName,
            configKey,
          });
        }
      : (ref) => {
          const configKey = formatExternalConfigKey(
            ref.stackPath,
            ref.outputName,
          );
          externalConfigKeys?.add(configKey);
        },
  });
  return serializePropertyValue(resolvedProps, ctx) as Record<string, unknown>;
}

function serializeResourceOptions(
  resource: ResourceIR,
  names: ResourceNameAllocator,
): PulumiYamlResourceOptions | undefined {
  const opts: PulumiYamlResourceOptions = {};

  if (resource.options?.dependsOn) {
    const resolved = resource.options.dependsOn.map((address) => {
      const name = names.getName(address);
      if (!name) {
        throw new Error(
          `Failed to resolve dependsOn target ${address.stackPath}/${address.id}`,
        );
      }
      return formatResourceReference(name);
    });

    if (resolved.length > 0) {
      opts.dependsOn = resolved;
    }
  }

  if (resource.options?.retainOnDelete) {
    opts.protect = true;
  }

  return Object.keys(opts).length > 0 ? opts : undefined;
}

function formatResourceReference(name: string): string {
  return `\${${name}}`;
}

function formatExternalConfigKey(
  stackPath: string,
  outputName: string,
): string {
  const normalizedStack = normalizeForConfigKey(stackPath);
  const normalizedOutput = normalizeForConfigKey(outputName);
  return `external.${normalizedStack}.${normalizedOutput}`;
}

function formatConfigVariable(key: string): string {
  return key;
}

function normalizeForConfigKey(value: string): string {
  const dotted = value.replace(/[\\/]+/g, '.');
  return dotted.replace(/[^A-Za-z0-9_.-]/g, '-');
}

function formatPropertyPath(path: (string | number)[]): string {
  if (path.length === 0) {
    return '(root)';
  }
  return path
    .map((part) => (typeof part === 'number' ? `[${part}]` : part))
    .reduce((acc, part) => {
      if (acc.length === 0) {
        return part;
      }
      if (part.startsWith('[')) {
        return `${acc}${part}`;
      }
      return `${acc}.${part}`;
    }, '');
}

class ResourceNameAllocator {
  private readonly nameByAddress = new Map<string, string>();

  constructor(program: ProgramIR) {
    for (const stack of program.stacks) {
      for (const resource of stack.resources) {
        const address: StackAddress = {
          id: resource.logicalId,
          stackPath: stack.stackPath,
        };

        const normalized = normalizeResourceName(resource);
        this.nameByAddress.set(addressKey(address), normalized);
      }
    }
  }

  getName(address: StackAddress): string | undefined {
    return this.nameByAddress.get(addressKey(address));
  }
}

function collectParameterDefaults(
  program: ProgramIR,
): Map<string, PropertyValue> {
  const defaults = new Map<string, PropertyValue>();
  for (const stack of program.stacks) {
    if (!stack.parameters) {
      continue;
    }
    for (const parameter of stack.parameters) {
      if (parameter.default !== undefined) {
        defaults.set(
          parameterKey(stack.stackPath, parameter.name),
          parameter.default,
        );
      }
    }
  }
  return defaults;
}

function parameterKey(stackPath: string, parameterName: string): string {
  return `${stackPath}::${parameterName}`;
}

function addressKey(address: StackAddress): string {
  return `${address.stackPath}::${address.id}`;
}

function normalizeResourceName(resource: ResourceIR): string {
  if (requiresLowercaseResourceName(resource.cfnType)) {
    return resource.logicalId.toLowerCase();
  }
  return resource.logicalId;
}

const LOWERCASE_NAME_CFN_TYPES = new Set([
  'AWS::S3::Bucket',
  'AWS::S3::AccessPoint',
  'AWS::ECR::Repository',
]);

function requiresLowercaseResourceName(cfnType: string): boolean {
  return LOWERCASE_NAME_CFN_TYPES.has(cfnType);
}

function collectStackOutputs(program: ProgramIR): Map<string, PropertyValue> {
  const outputs = new Map<string, PropertyValue>();
  for (const stack of program.stacks) {
    if (!stack.outputs) {
      continue;
    }
    for (const output of stack.outputs) {
      outputs.set(stackOutputKey(stack.stackPath, output.name), output.value);
    }
  }
  return outputs;
}

function stackOutputKey(stackPath: string, outputName: string): string {
  return `${stackPath}::${outputName}`;
}

interface ResolveStackOutputOptions {
  stackOutputs: Map<string, PropertyValue>;
  includedStackPaths?: Set<string>;
  onMissingStackOutput?: (
    ref: { kind: 'stackOutput'; stackPath: string; outputName: string },
    path: (string | number)[],
  ) => void;
}

function resolveStackOutputReferences(
  value: PropertyValue,
  options: ResolveStackOutputOptions,
  seen?: string[],
  path: (string | number)[] = [],
): PropertyValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, idx) =>
      resolveStackOutputReferences(item, options, seen, [...path, idx]),
    );
  }

  if (isPropertyMap(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        resolveStackOutputReferences(nested, options, seen, [...path, key]),
      ]),
    );
  }

  switch (value.kind) {
    case 'stackOutput':
      return resolveStackOutputValue(value, options, seen ?? [], path);
    case 'concat':
      return {
        kind: 'concat',
        delimiter: value.delimiter,
        values: value.values.map((item) =>
          resolveStackOutputReferences(item, options, seen, path),
        ),
      };
    default:
      return value;
  }
}

function resolveStackOutputValue(
  ref: { kind: 'stackOutput'; stackPath: string; outputName: string },
  options: ResolveStackOutputOptions,
  seen: string[],
  path: (string | number)[],
): PropertyValue {
  const key = stackOutputKey(ref.stackPath, ref.outputName);
  if (seen.includes(key)) {
    throw new Error(
      `Detected circular stack output reference involving ${ref.stackPath}/${ref.outputName}`,
    );
  }
  const value = options.stackOutputs.get(key);
  if (value !== undefined) {
    return resolveStackOutputReferences(value, options, [...seen, key], path);
  }
  if (options.includedStackPaths?.has(ref.stackPath)) {
    throw new Error(
      `Failed to resolve stack output ${ref.outputName} in stack ${ref.stackPath}`,
    );
  }
  options.onMissingStackOutput?.(ref, path);
  return ref;
}

function isPropertyMap(value: PropertyValue): value is PropertyMap {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('kind' in value)
  );
}
