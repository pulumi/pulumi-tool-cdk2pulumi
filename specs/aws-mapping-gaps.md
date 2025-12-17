# AWS provider mapping gaps

Purpose: track CloudFormation resources that currently map to the classic `aws` provider in `schemas/primary-identifiers.json`, since these still need explicit mappings/handling alongside the aws-native defaults (e.g., in `src/cli/ir-post-processor.ts`). Update this list as we add coverage.

Source: generated from `schemas/primary-identifiers.json` entries with `provider: "aws"` (list captured 2025-02-XX). Regenerate via `jq -r 'to_entries[] | select((.value|type)=="object" and .value.provider=="aws") | .key' schemas/primary-identifiers.json`.

## Priority buckets

### High
- AWS::CertificateManager::Certificate
- AWS::CloudWatch::{AnomalyDetector, InsightRule}
- AWS::CodeBuild::{Project, ReportGroup, SourceCredential}
- AWS::CodeCommit::Repository
- AWS::CodeDeploy::DeploymentGroup
- AWS::Config::{ConfigurationRecorder, DeliveryChannel, OrganizationConfigRule, RemediationConfiguration}
- AWS::DMS::{Certificate, Endpoint, EventSubscription, ReplicationInstance, ReplicationSubnetGroup, ReplicationTask}
- AWS::EC2::{ClientVpnAuthorizationRule, ClientVpnEndpoint, ClientVpnRoute, ClientVpnTargetNetworkAssociation, NetworkAclEntry, NetworkInterfacePermission, VPNGatewayRoutePropagation}
- AWS::ElastiCache::{CacheCluster, ReplicationGroup}
- AWS::ElasticLoadBalancing::LoadBalancer
- AWS::ElasticLoadBalancingV2::ListenerCertificate
- AWS::Elasticsearch::Domain
- AWS::FSx::{FileSystem, Snapshot, StorageVirtualMachine, Volume}
- AWS::Glue::{Classifier, Connection, DataCatalogEncryptionSettings, DataQualityRuleset, DevEndpoint, MLTransform, Partition, SecurityConfiguration, Table, Workflow}
- AWS::IAM::AccessKey
- AWS::Route53::{RecordSet, RecordSetGroup}
- AWS::SES::{ReceiptFilter, ReceiptRule, ReceiptRuleSet}
- AWS::SQS::QueuePolicy
- AWS::SSM::{MaintenanceWindow, MaintenanceWindowTarget, MaintenanceWindowTask}
- AWS::SageMaker::{CodeRepository, EndpointConfig, Model, NotebookInstance, NotebookInstanceLifecycleConfig, Workteam}
- AWS::ServiceDiscovery::{HttpNamespace, Instance, PrivateDnsNamespace, PublicDnsNamespace, Service}

### Medium
- AWS::ApiGatewayV2::{ApiGatewayManagedOverrides, Stage}
- AWS::AppMesh::{GatewayRoute, Mesh, Route, VirtualGateway, VirtualNode, VirtualRouter, VirtualService}
- AWS::AppSync::{ApiCache, ApiKey, GraphQLSchema}
- AWS::AutoScalingPlans::ScalingPlan
- AWS::Budgets::Budget
- AWS::CUR::ReportDefinition
- AWS::DAX::{Cluster, ParameterGroup, SubnetGroup}
- AWS::DLM::LifecyclePolicy
- AWS::DocDB::{DBCluster, DBClusterParameterGroup, DBInstance, DBSubnetGroup, EventSubscription}
- AWS::ECR::PublicRepository
- AWS::EMR::{Cluster, InstanceFleetConfig, InstanceGroupConfig}
- AWS::IoT::{PolicyPrincipalAttachment, ThingPrincipalAttachment}
- AWS::KinesisAnalyticsV2::{ApplicationCloudWatchLoggingOption, ApplicationOutput, ApplicationReferenceDataSource}
- AWS::LakeFormation::{DataLakeSettings, Permissions, Resource}
- AWS::Lightsail::{Distribution, Domain}
- AWS::MediaConvert::{JobTemplate, Preset, Queue}
- AWS::MediaLive::{Channel, Input, InputSecurityGroup}
- AWS::ServiceCatalog::{AcceptedPortfolioShare, LaunchRoleConstraint, Portfolio, StackSetConstraint}
- AWS::WorkSpaces::Workspace

### Lower / niche
- AWS::AmazonMQ::ConfigurationAssociation
- AWS::AppStream::{Fleet, Stack, StackFleetAssociation, StackUserAssociation, User}
- AWS::BCMDataExports::Export
