const pulumi = require("@pulumi/pulumi");
const route53 = require("@pulumi/aws/route53");
const aws = require("@pulumi/aws");
const { createVpc } = require("./resources/vpc");
const { createInternetGateway } = require("./resources/gateway");
const { createSubnets } = require("./resources/subnets");
const {
  createRouteTable,
  associateRouteTable,
  createPublicRoute,
} = require("./resources/routeTable");

const config = new pulumi.Config();
const hostedZoneId = config.get("HostedZoneId");
const domainName = config.get("DomainName");
const baseCidrBlock = config.get("baseCidrBlock");
const ipRange = config.get("ipRange");
const maxZones = config.get("maxZones");
const volumeSize = config.get("volumeSize");
const volumeType = config.get("volumeType");
const keyName = config.get("keyName");
const amiId = config.get("amiId");
const ec2Name = config.get("ec2Name");
const securityName = config.get("securityName");
const PGPORT = config.get("PGPORT");
const PGPASSWORD = config.get("PGPASSWORD");
const PGUSER = config.get("PGUSER");
const PGDATABASE = config.get("PGDATABASE");
const RDSDBNAME = config.get("RDSDBNAME");
const RDSUSERNAME = config.get("RDSUSERNAME");
const RDSPASSWORD = config.get("RDSPASSWORD");
const gcp = require("@pulumi/gcp");

const gcsBucket = new gcp.storage.Bucket("gcsBucket", {
  name: "csye6225demolambdabucketv1",
  location: "us",
  forceDestroy: true,
  versioning: {
    enabled: true,
  },
});

const topic = new aws.sns.Topic("serverless", {
  displayName: "serverless",
});

const lambdaRole = new aws.iam.Role("LambdaFunctionRole", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: ["lambda.amazonaws.com"],
        },
        Action: ["sts:AssumeRole"],
      },
    ],
  }),
});

const lambdaPolicyArns = [
  "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
  "arn:aws:iam::aws:policy/AmazonS3FullAccess",
  "arn:aws:iam::aws:policy/AWSLambda_FullAccess",
  "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
];

const cloudWatchLogsAttachment = new aws.iam.RolePolicyAttachment(
  "lambdaPolicy-CloudWatchLogs",
  {
    role: lambdaRole.name,
    policyArn: lambdaPolicyArns[0],
  }
);

const s3FullAccessAttachment = new aws.iam.RolePolicyAttachment(
  "lambdaPolicy-S3FullAccess",
  {
    role: lambdaRole.name,
    policyArn: lambdaPolicyArns[1],
  }
);

const lambdaFullAccessAttachment = new aws.iam.RolePolicyAttachment(
  "lambdaPolicy-LambdaFullAccess",
  {
    role: lambdaRole.name,
    policyArn: lambdaPolicyArns[2],
  }
);

const dynamoDBFullAccessAttachment = new aws.iam.RolePolicyAttachment(
  "lambdaPolicy-DynamoDBFullAccess",
  {
    role: lambdaRole.name,
    policyArn: lambdaPolicyArns[3],
  }
);

const topicPolicy = new aws.iam.Policy("EC2TopicAccessPolicy", {
  policy: {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AllowEC2ToPublishToSNSTopic",
        Effect: "Allow",
        Action: ["sns:Publish", "sns:CreateTopic"],
        Resource: topic.arn,
      },
    ],
  },
  roles: [lambdaRole],
});

const serviceAccount = new gcp.serviceaccount.Account("myServiceAccount", {
  accountId: "gcp-bucket-service-account",
  displayName: "GCP Bucket Service Account",
});

const bucketAccess = new gcp.storage.BucketIAMBinding("bucketAccess", {
  bucket: gcsBucket.name,
  role: "roles/storage.objectAdmin",
  members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
});

const serviceAccountKeys = new gcp.serviceaccount.Key("myServiceAccountKeys", {
  serviceAccountId: serviceAccount.id,
});

// Create a DynamoDB table
const dynamoDBTable = new aws.dynamodb.Table("dynamoDBTable", {
  name: "Csye6225_Demo_DynamoDB",
  attributes: [
    {
      name: "id",
      type: "S",
    },
    {
      name: "status",
      type: "S",
    }, 
    {
      name: "timestamp",
      type: "S",
    },
    {
      name: "email",
      type: "S",
    },
  ],
  hashKey: "id",
  rangeKey: "status",
  readCapacity: 5,
  writeCapacity: 5,
  globalSecondaryIndexes: [
    {
      name: "TimestampIndex",
      hashKey: "timestamp",
      rangeKey: "id",
      projectionType: "ALL",
      readCapacity: 5,
      writeCapacity: 5,
    },
    {
      name: "EmailIndex",
      hashKey: "email",
      rangeKey: "id",
      projectionType: "ALL",
      readCapacity: 5,
      writeCapacity: 5,
    },
  ],
});
// Create an IAM policy for DynamoDB access
const dynamoDBPolicy = new aws.iam.Policy("DynamoDBAccessPolicy", {
  policy: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query", // Add other necessary actions
        ],
        Resource: dynamoDBTable.arn,
      },
    ],
  },
});

// Attach the DynamoDB policy to the Lambda execution role
const dynamoDBPolicyAttachment = new aws.iam.PolicyAttachment(
  "DynamoDBPolicyAttachment",
  {
    policyArn: dynamoDBPolicy.arn,
    roles: [lambdaRole.name],
    dependsOn: [dynamoDBTable], // Assuming lambdaRole is the execution role for your Lambda function
  }
);

const lambdaFunction = new aws.lambda.Function("LambdaFunction", {
  functionName: "serverless",
  role: lambdaRole.arn,
  runtime: "nodejs16.x",
  handler: "index.handler",
  code: new pulumi.asset.FileArchive(
    "/Users/shobhitsrivastava/Documents/CLOUD_ASSIGNMENTS/Assignment_9/serverless/Archive.zip"
  ),
  environment: {
    variables: {
      GCP_PRIVATE_KEY: serviceAccountKeys.privateKey,
      GCS_BUCKET_NAME: gcsBucket.name,
      DYNAMODB_TABLE_NAME: dynamoDBTable.name,
    },
  },
});

new aws.sns.TopicSubscription(`SNSSubscription`, {
  topic: topic.arn,
  protocol: "lambda",
  endpoint: lambdaFunction.arn,
});

new aws.iam.PolicyAttachment("topicPolicyAttachment", {
  policyArn: topicPolicy.arn,
  roles: [lambdaRole.name],
});

new aws.lambda.Permission("with_sns", {
  statementId: "AllowExecutionFromSNS",
  action: "lambda:InvokeFunction",
  function: lambdaFunction.name,
  principal: "sns.amazonaws.com",
  sourceArn: topic.arn,
});

const azs = aws.getAvailabilityZones({ state: "available" });
const vpc = createVpc(baseCidrBlock, ipRange);
const ig = createInternetGateway(vpc.id);
azs
  .then((data) => {
    const publicSubnets = createSubnets(
      vpc,
      azs,
      "public",
      Math.min(maxZones, data.names?.length),
      baseCidrBlock,
      ipRange,
      0
    );
    const privateSubnets = createSubnets(
      vpc,
      azs,
      "private",
      Math.min(maxZones, data.names?.length),
      baseCidrBlock,
      ipRange,
      4
    );

    console.log("Public Subnets", publicSubnets);
    const publicRouteTable = createRouteTable(vpc, "public");
    associateRouteTable(publicSubnets, publicRouteTable, "public");

    const privateRouteTable = createRouteTable(vpc, "private");
    associateRouteTable(privateSubnets, privateRouteTable, "private");

    createPublicRoute(publicRouteTable, ig.id);

    const cloudwatchLogsPolicy = new aws.iam.Policy("cloudwatchLogsPolicy", {
      description: "A policy that allows sending logs to CloudWatch",
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
              "logs:DescribeLogStreams",
            ],
            Effect: "Allow",
            Resource: "arn:aws:logs:*:*:*",
          },
        ],
      }),
    });

    const ec2Role = new aws.iam.Role("ec2Role", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "ec2.amazonaws.com",
            },
          },
        ],
      }),
    });

    new aws.iam.RolePolicyAttachment("rolePolicyAttachment", {
      role: ec2Role.name,
      policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
    });

    const instanceProfile = new aws.iam.InstanceProfile("instanceProfile", {
      role: ec2Role.name,
    });

    const lbSg = new aws.ec2.SecurityGroup("lb_sg", {
      name: "load balancer",
      description: "Allow TLS inbound traffic",
      vpcId: vpc.id,

      ingress: [
        {
          description: "https from Anywhere",
          fromPort: 443,
          toPort: 443,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
        },
        {
          description: "http from anywhere",
          fromPort: 80,
          toPort: 80,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],

      egress: [
        {
          fromPort: 0,
          toPort: 0,
          protocol: "-1",
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],

      tags: {
        Name: "load balancer",
      },
    });

    const appSecurityGroup = new aws.ec2.SecurityGroup(
      "application security group",
      {
        description: "Security group for application servers",
        vpcId: vpc.id,
        ingress: [
          {
            protocol: "tcp",
            fromPort: 22,
            toPort: 22,
            cidrBlocks: ["0.0.0.0/0"],
          },
          {
            protocol: "tcp",
            fromPort: 8080,
            toPort: 8080,
            cidrBlocks: ["0.0.0.0/0"],
          },
        ],
        egress: [
          {
            protocol: "-1", // All
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
          },
        ],
        tags: {
          Name: securityName,
        },
      }
    );

    const dbSubnetGroup = new aws.rds.SubnetGroup("db_subnet_group", {
      subnetIds: privateSubnets,
      description: "RDS Subnet Group",
      tags: {
        Name: "RDS Subnet Group",
      },
    });

    const rdsSecurityGroup = new aws.ec2.SecurityGroup("rdssg", {
      description: "RDS security group",
      vpcId: vpc.id,
      ingress: [
        {
          protocol: "tcp",
          fromPort: 5432,
          toPort: 5432,
          securityGroups: [appSecurityGroup.id],
        },
      ],
      egress: [
        {
          protocol: "-1", // All
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
    });

    const dbParameterGroup = new aws.rds.ParameterGroup(
      "my-db-parameter-group",
      {
        family: "postgres15",
        description: "Custom parameter group for csye6225",
      }
    );
    const rdsInstance = new aws.rds.Instance("csye6225", {
      engine: "postgres",
      instanceClass: "db.t3.micro",
      engineVersion: 15,
      allocatedStorage: 20,
      parameterGroupName: dbParameterGroup.name,
      storageType: "gp2",
      dbName: RDSDBNAME,
      username: RDSUSERNAME,
      password: RDSPASSWORD,
      skipFinalSnapshot: true,
      vpcSecurityGroupIds: [rdsSecurityGroup.id],
      dbSubnetGroupName: dbSubnetGroup.name,
      publiclyAccessible: false,
    });

    const userDataTemplate = pulumi.interpolate`#!/bin/bash
    cd /opt/csye6225
    rm /opt/csye6225/.env
    touch /opt/csye6225/.env
    echo PGPORT=${PGPORT} >> /opt/csye6225/.env
    echo PGUSER="${PGUSER}" >> /opt/csye6225/.env
    echo PGPASSWORD="${PGPASSWORD}" >> /opt/csye6225/.env
    echo PGDATABASE="${PGDATABASE}" >> /opt/csye6225/.env
    echo CSVPATH="/opt/csye6225/users.csv" >> /opt/csye6225/.env
    echo PGHOST=${rdsInstance.address} >> /opt/csye6225/.env
    echo TopicArn=${topic.arn} >> /opt/csye6225/.env
    echo AWS_REGION='us-west-1' >> /opt/csye6225/.env
    sudo systemctl restart nodeserver
    sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \    -a fetch-config \    -m ec2 \    -c file:/opt/csye6225/configs/cloudwatch-agent-config.json \    -s
    sudo systemctl enable amazon-cloudwatch-agent
    sudo systemctl start amazon-cloudwatch-agent`;

    /*    const ec2Instance = new aws.ec2.Instance("appServer", {
      instanceType: "t2.micro",
      ami: amiId,
      vpcSecurityGroupIds: [appSecurityGroup.id],
      subnetId: publicSubnets[0],
      userDataReplaceOnChange: true,
      iamInstanceProfile: instanceProfile.name,
      userData: userData,
      keyName: keyName,
      rootBlockDevice: {
        volumeSize: volumeSize,
        volumeType: volumeType,
        deleteOnTermination: true,
      },
      dependsOn: [rdsInstance],
      tags: {
        Name: ec2Name,
      },
      disableApiTermination: false,
    }); */

    const snsPublishPolicy = new aws.iam.Policy("SNSPublishPolicy", {
      policy: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "sns:Publish",
            Resource: topic.arn,
          },
        ],
      },
      roles: [ec2Role.name],
    });

    const snsPublishPolicyAttachment = new aws.iam.RolePolicyAttachment(
      "SNSPublishPolicyAttachment",
      {
        role: ec2Role.name,
        policyArn: snsPublishPolicy.arn,
      }
    );

    const launchtemplate = new aws.ec2.LaunchTemplate("launchtemplate", {
      name: "asg_launch_config",
      imageId: amiId,
      instanceType: "t2.micro",
      keyName: keyName,
      disableApiTermination: false,
      dependsOn: [rdsInstance],

      iamInstanceProfile: {
        name: instanceProfile.name,
      },

      blockDeviceMappings: [
        {
          deviceName: "/dev/xvda",
          ebs: {
            deleteOnTermination: true,
            volumeSize: 25,
            volumeType: "gp2",
          },
        },
      ],

      networkInterfaces: [
        {
          associatePublicIpAddress: true,
          deleteOnTermination: true,
          securityGroups: [appSecurityGroup.id],
        },
      ],

      tagSpecifications: [
        {
          resourceType: "instance",
          tags: {
            Name: "csye6225_asg",
          },
        },
      ],

      userData: userDataTemplate.apply((data) =>
        Buffer.from(data).toString("base64")
      ),
    });

    const loadbalancer = new aws.lb.LoadBalancer("webAppLB", {
      name: "csye6225-lb",
      internal: false,
      loadBalancerType: "application",
      securityGroups: [lbSg.id],
      subnets: publicSubnets,
      enableDeletionProtection: false,
      tags: {
        Application: "WebApp",
      },
    });

    const targetGroup = new aws.lb.TargetGroup("webAppTargetGroup", {
      name: "csye6225-lb-tg",
      port: 8080,
      protocol: "HTTP",
      vpcId: vpc.id,
      targetType: "instance",
      healthCheck: {
        enabled: true,
        path: "/healthz",
        port: "traffic-port",
        protocol: "HTTP",
        healthyThreshold: 2,
        unhealthyThreshold: 2,
        timeout: 6,
        interval: 30,
      },
    });

    new aws.lb.Listener("webAppListener", {
      loadBalancerArn: loadbalancer.arn,
      port: "80",
      protocol: "HTTP",
      defaultActions: [
        {
          type: "forward",
          targetGroupArn: targetGroup.arn,
        },
      ],
    });

    const asg = new aws.autoscaling.Group("asg", {
      name: "asg_launch_config",
      maxSize: 3,
      minSize: 1,
      desiredCapacity: 1,
      forceDelete: true,
      defaultCooldown: 60,
      vpcZoneIdentifiers: publicSubnets,
      instanceProfile: instanceProfile.name,

      tags: [
        {
          key: "Name",
          value: "asg_launch_config",
          propagateAtLaunch: true,
        },
      ],

      launchTemplate: {
        id: launchtemplate.id,
        version: "$Latest",
      },
      dependsOn: [targetGroup],
      targetGroupArns: [targetGroup.arn],
    });

    const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
      autoscalingGroupName: asg.name,
      scalingAdjustment: 1,
      cooldown: 60,
      adjustmentType: "ChangeInCapacity",
      autocreationCooldown: 60,
      cooldownDescription: "Scale up policy when CPU usage is above 5%",
      policyType: "SimpleScaling",
      scalingTargetId: asg.id,
    });

    const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
      autoscalingGroupName: asg.name,
      scalingAdjustment: -1,
      cooldown: 60,
      adjustmentType: "ChangeInCapacity",
      autocreationCooldown: 60,
      cooldownDescription: "Scale down policy when CPU usage is below 3%",
      policyType: "SimpleScaling",
      scalingTargetId: asg.id,
    });

    new aws.cloudwatch.MetricAlarm("cpuUtilizationAlarmHigh", {
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 1,
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      period: 60,
      threshold: 5,
      statistic: "Average",
      alarmActions: [scaleUpPolicy.arn],
      dimensions: { AutoScalingGroupName: asg.name },
    });

    new aws.cloudwatch.MetricAlarm("cpuUtilizationAlarmLow", {
      comparisonOperator: "LessThanThreshold",
      evaluationPeriods: 1,
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      period: 60,
      statistic: "Average",
      threshold: 3,
      alarmActions: [scaleDownPolicy.arn],
      dimensions: { AutoScalingGroupName: asg.name },
    });
    new aws.route53.Record(`aRecord`, {
      name: domainName,
      type: "A",
      zoneId: hostedZoneId,
      aliases: [
        {
          name: loadbalancer.dnsName,
          zoneId: loadbalancer.zoneId,
          evaluateTargetHealth: true,
        },
      ],
    });
  })
  .catch((error) => {
    console.error("Error creating subnets", error);
  });
exports.vpcId = vpc.id;
