const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const { createVpc } = require("./resources/vpc");
const { createInternetGateway } = require("./resources/gateway");
const { createSubnets } = require("./resources/subnets");
const { createRouteTable, associateRouteTable, createPublicRoute } = require("./resources/routeTable");

const config = new pulumi.Config();
const baseCidrBlock = config.get('baseCidrBlock');
const azs = aws.getAvailabilityZones();

const vpc = createVpc(baseCidrBlock);
const ig = createInternetGateway(vpc.id);

console.log("VPC", vpc.id);
const publicSubnets = createSubnets(vpc, azs, "public", 3);
const privateSubnets = createSubnets(vpc, azs, "private", 3);

const publicRouteTable = createRouteTable(vpc, "public");
associateRouteTable(publicSubnets, publicRouteTable, "public");

const privateRouteTable = createRouteTable(vpc, "private");
associateRouteTable(privateSubnets, privateRouteTable, "private");

createPublicRoute(publicRouteTable, ig.id);

exports.vpcId = vpc.id;
