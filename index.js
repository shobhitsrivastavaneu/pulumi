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
const azs = aws.getAvailabilityZones({ state: "available" });
const vpc = createVpc(baseCidrBlock, ipRange);
const ig = createInternetGateway(vpc.id);
azs.then((data) => {
  console.log("Data--", data.names?.length);
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
});

exports.vpcId = vpc.id;
