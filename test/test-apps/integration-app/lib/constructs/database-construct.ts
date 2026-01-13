import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface DatabaseConstructProps {
  vpc: ec2.IVpc;
  encryptionKey: kms.IKey;
  removalPolicy?: cdk.RemovalPolicy;
  dbClusterInstanceType?: ec2.InstanceType;
  defaultDatabaseName?: string;
}

export class Database extends Construct {
  public readonly dbCluster: rds.DatabaseCluster;
  public readonly dbProxy: rds.DatabaseProxy;
  public readonly dbSubnetGroup: rds.SubnetGroup;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;

    // RDS Subnet Group
    this.dbSubnetGroup = new rds.SubnetGroup(this, 'DbSubnetGroup', {
      vpc: props.vpc,
      description: 'Subnet group for RDS',
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Security Group for RDS
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for RDS database',
      allowAllOutbound: true,
    });

    // Security Group Ingress
    this.dbSecurityGroup.addIngressRule(
      this.dbSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from same security group',
    );

    // RDS DB Cluster (auto-named, secret auto-named)
    this.dbCluster = new rds.DatabaseCluster(this, 'DbCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_17_5,
      }),
      writer: rds.ClusterInstance.provisioned('writer', {
        instanceType:
          props.dbClusterInstanceType ||
          ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      }),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      vpc: props.vpc,
      defaultDatabaseName: props.defaultDatabaseName || 'appdb',
      credentials: rds.Credentials.fromGeneratedSecret('dbadmin', {
        encryptionKey: props.encryptionKey,
      }),
      storageEncrypted: true,
      removalPolicy,
    });

    // DB Proxy
    this.dbProxy = this.dbCluster.addProxy('DbProxy', {
      secrets: [this.dbCluster.secret!],
      vpc: props.vpc,
      securityGroups: [this.dbSecurityGroup],
      requireTLS: true,
    });
  }
}
