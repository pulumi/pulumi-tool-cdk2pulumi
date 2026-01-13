import { Duration } from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface EncryptionConstructProps {
  description?: string;
  enableKeyRotation?: boolean;
}

export class Encryption extends Construct {
  public readonly kmsKey: kms.Key;

  constructor(
    scope: Construct,
    id: string,
    props: EncryptionConstructProps = {},
  ) {
    super(scope, id);

    this.kmsKey = new kms.Key(this, 'KmsKey', {
      description: props.description || 'KMS key for encryption',
      enableKeyRotation: props.enableKeyRotation ?? true,
      pendingWindow: Duration.days(7),
    });
  }
}
