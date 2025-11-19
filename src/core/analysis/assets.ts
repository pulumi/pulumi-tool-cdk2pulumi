import * as fs from 'fs-extra';

export interface AssetDetails {
  readonly id: string;
  readonly sourcePath: string;
  readonly packaging: 'file' | 'zip' | 'container' | 'unknown';
  readonly destinations: Record<string, AssetDestination>;
}

export interface AssetDestination {
  readonly region?: string;
  readonly assumeRoleArn?: string;
  readonly bucketName?: string;
  readonly objectKey?: string;
  readonly repositoryName?: string;
  readonly imageTag?: string;
}

export type AssetLookup = (assetHash: string) => AssetDetails | undefined;

interface AssetManifest {
  readonly files?: Record<string, FileAsset>;
  readonly dockerImages?: Record<string, DockerImageAsset>;
}

interface FileAsset {
  readonly source: {
    readonly path: string;
    readonly packaging?: string;
  };
  readonly destinations: Record<string, FileDestination>;
}

interface DockerImageAsset {
  readonly source: {
    readonly directory?: string;
  };
  readonly destinations: Record<string, DockerImageDestination>;
}

interface FileDestination {
  readonly region?: string;
  readonly assumeRoleArn?: string;
  readonly bucketName?: string;
  readonly objectKey?: string;
}

interface DockerImageDestination {
  readonly region?: string;
  readonly assumeRoleArn?: string;
  readonly repositoryName?: string;
  readonly imageTag?: string;
}

/**
 * Loads an asset manifest from the given file path and returns a lookup function.
 */
export function loadAssetManifest(manifestPath: string): AssetLookup {
  try {
    const manifest: AssetManifest = fs.readJSONSync(manifestPath);
    const assets = new Map<string, AssetDetails>();

    for (const [hash, file] of Object.entries(manifest.files || {})) {
      assets.set(hash, {
        id: hash,
        sourcePath: file.source.path,
        packaging: (file.source.packaging as any) ?? 'file',
        destinations: mapFileDestinations(file.destinations),
      });
    }

    for (const [hash, image] of Object.entries(manifest.dockerImages || {})) {
      assets.set(hash, {
        id: hash,
        sourcePath: image.source.directory ?? 'unknown',
        packaging: 'container',
        destinations: mapDockerDestinations(image.destinations),
      });
    }

    return (hash: string) => assets.get(hash);
  } catch (e) {
    // If the manifest doesn't exist or is invalid, return a no-op lookup
    // This is acceptable as not all assemblies have assets
    return () => undefined;
  }
}

function mapFileDestinations(
  dests: Record<string, FileDestination>,
): Record<string, AssetDestination> {
  const result: Record<string, AssetDestination> = {};
  for (const [id, dest] of Object.entries(dests)) {
    result[id] = {
      region: dest.region,
      assumeRoleArn: dest.assumeRoleArn,
      bucketName: dest.bucketName,
      objectKey: dest.objectKey,
    };
  }
  return result;
}

function mapDockerDestinations(
  dests: Record<string, DockerImageDestination>,
): Record<string, AssetDestination> {
  const result: Record<string, AssetDestination> = {};
  for (const [id, dest] of Object.entries(dests)) {
    result[id] = {
      region: dest.region,
      assumeRoleArn: dest.assumeRoleArn,
      repositoryName: dest.repositoryName,
      imageTag: dest.imageTag,
    };
  }
  return result;
}
