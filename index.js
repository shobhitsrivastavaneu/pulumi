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

    const appSecurityGroup = new aws.ec2.SecurityGroup(
      "application security group",
      {
        description: "Security group for application servers",
        vpcId: vpc.id,
        ingress: [
          {
            protocol: "tcp",
            fromPort: 80,
            toPort: 80,
            cidrBlocks: ["0.0.0.0/0"],
            ipv6CidrBlocks: ["::/0"],
          },
          {
            protocol: "tcp",
            fromPort: 22,
            toPort: 22,
            cidrBlocks: ["0.0.0.0/0"],
            ipv6CidrBlocks: ["::/0"],
          },
          {
            protocol: "tcp",
            fromPort: 443,
            toPort: 443,
            cidrBlocks: ["0.0.0.0/0"],
            ipv6CidrBlocks: ["::/0"],
          },
          {
            protocol: "tcp",
            fromPort: 8080,
            toPort: 8080,
            cidrBlocks: ["0.0.0.0/0"],
            ipv6CidrBlocks: ["::/0"],
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
      subnetIds: privateSubnets, // Assuming `createSubnets` returns an array of subnet IDs
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

    const ec2Instance = new aws.ec2.Instance("appServer", {
      instanceType: "t2.micro",
      ami: amiId,
      vpcSecurityGroupIds: [appSecurityGroup.id],
      subnetId: publicSubnets[0],
      userDataReplaceOnChange: true,
      iamInstanceProfile: instanceProfile.name,
      userData: pulumi.interpolate`#!/bin/bash
      cd /opt/csye6225
      rm /opt/csye6225/.env
      touch /opt/csye6225/.env
      echo PGPORT=${PGPORT} >> /opt/csye6225/.env
      echo PGUSER="${PGUSER}" >> /opt/csye6225/.env
      echo PGPASSWORD="${PGPASSWORD}" >> /opt/csye6225/.env
      echo PGDATABASE="${PGDATABASE}" >> /opt/csye6225/.env
      echo CSVPATH="/opt/csye6225/users.csv" >> /opt/csye6225/.env
      echo PGHOST=${rdsInstance.address} >> /opt/csye6225/.env
      sudo systemctl restart nodeserver
      sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \    -a fetch-config \    -m ec2 \    -c file:/opt/csye6225/configs/cloudwatch-agent-config.json \    -s
      sudo systemctl enable amazon-cloudwatch-agent
      sudo systemctl start amazon-cloudwatch-agent`,
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
    });
    new route53.Record("aRecord", {
      zoneId: hostedZoneId,
      name: domainName,
      type: "A",
      ttl: 300,
      records: [ec2Instance.publicIp], // Assumes ec2Instance has a public IP assigned
      dependsOn: [ec2Instance],
    });
  })
  .catch((error) => {
    console.error("Error creating subnets", error);
  });

exports.vpcId = vpc.id;
