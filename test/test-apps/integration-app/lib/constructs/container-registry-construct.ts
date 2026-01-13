import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface ContainerRegistryConstructProps {
  encryptionKey: kms.IKey;
  imageScanOnPush?: boolean;
  removalPolicy?: cdk.RemovalPolicy;
}

export class ContainerRegistry extends Construct {
  public readonly repository: ecr.Repository;

  constructor(
    scope: Construct,
    id: string,
    props: ContainerRegistryConstructProps,
  ) {
    super(scope, id);

    // ECR Repository
    this.repository = new ecr.Repository(this, 'EcrRepository', {
      imageScanOnPush: props.imageScanOnPush ?? true,
      encryption: ecr.RepositoryEncryption.KMS,
      encryptionKey: props.encryptionKey,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });
  }
}
