import * as path from 'path';
import * as fs from 'fs-extra';
import { loadAssetManifest } from '../../../src/core/analysis/assets';

describe('loadAssetManifest', () => {
  const testDir = path.join(__dirname, 'test-assets');
  const manifestPath = path.join(testDir, 'assets.json');

  beforeAll(() => {
    fs.ensureDirSync(testDir);
    fs.writeJSONSync(manifestPath, {
      files: {
        asset1: {
          source: {
            path: 'asset1.zip',
            packaging: 'zip',
          },
          destinations: {
            dest1: {
              region: 'us-east-1',
              bucketName: 'my-bucket',
              objectKey: 'key1',
            },
          },
        },
      },
      dockerImages: {
        image1: {
          source: {
            directory: 'image1-dir',
          },
          destinations: {
            dest2: {
              region: 'us-west-2',
              repositoryName: 'my-repo',
              imageTag: 'latest',
            },
          },
        },
      },
    });
  });

  afterAll(() => {
    fs.removeSync(testDir);
  });

  test('should load file assets', () => {
    const lookup = loadAssetManifest(manifestPath);
    const asset = lookup('asset1');
    expect(asset).toBeDefined();
    expect(asset?.sourcePath).toBe('asset1.zip');
    expect(asset?.packaging).toBe('zip');
    expect(asset?.destinations.dest1.bucketName).toBe('my-bucket');
  });

  test('should load docker image assets', () => {
    const lookup = loadAssetManifest(manifestPath);
    const asset = lookup('image1');
    expect(asset).toBeDefined();
    expect(asset?.sourcePath).toBe('image1-dir');
    expect(asset?.packaging).toBe('container');
    expect(asset?.destinations.dest2.repositoryName).toBe('my-repo');
  });

  test('should return undefined for unknown assets', () => {
    const lookup = loadAssetManifest(manifestPath);
    expect(lookup('unknown')).toBeUndefined();
  });

  test('should handle missing manifest gracefully', () => {
    const lookup = loadAssetManifest('non-existent.json');
    expect(lookup('anything')).toBeUndefined();
  });
});
