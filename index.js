const pulumi = require("@pulumi/pulumi");
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
const baseCidrBlock = config.get("baseCidrBlock");
const ipRange = config.get("ipRange");
const maxZones = config.get("maxZones");
const volumeSize = config.get("volumeSize");
const volumeType = config.get("volumeType");
const keyName = config.get("keyName");
const amiId = config.get("amiId");
const securityName = config.get("securityName");
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
        tags: {
          Name: securityName,
        },
      }
    );
    new aws.ec2.Instance("appServer", {
      instanceType: "t2.micro",
      ami: amiId,
      vpcSecurityGroupIds: [appSecurityGroup.id],
      subnetId: publicSubnets[0],
      keyName: keyName,
      rootBlockDevice: {
        volumeSize: volumeSize,
        volumeType: volumeType,
        deleteOnTermination: true,
      },
      tags: {
        Name: ec2Name,
      },
      disableApiTermination: false,
    });
  })
  .catch((error) => {
    console.error("Error creating subnets", error);
  });

exports.vpcId = vpc.id;
