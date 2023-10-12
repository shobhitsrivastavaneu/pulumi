const aws = require("@pulumi/aws");

function createRouteTable(vpc, type) {
  return new aws.ec2.RouteTable(
    `${type}RouteTable`,
    {
      vpcId: vpc.id,
      tags: {
        Name: `${type.charAt(0).toUpperCase() + type.slice(1)}RouteTable`,
      },
    },
    { dependsOn: [vpc] }
  );
}
function associateRouteTable(subnets, routeTable, type) {
  subnets.forEach((subnet, idx) => {
    new aws.ec2.RouteTableAssociation(
      `${type}RTA-${idx}`,
      {
        subnetId: subnet.id,
        routeTableId: routeTable.id,
      },
      { dependsOn: [routeTable] }
    );
  });
}

function createPublicRoute(routeTable, gatewayId) {
  return new aws.ec2.Route(
    "publicRoute",
    {
      routeTableId: routeTable.id,
      destinationCidrBlock: "0.0.0.0/0",
      gatewayId: gatewayId,
    },
    { dependsOn: [routeTable] }
  );
}

exports.createRouteTable = createRouteTable;
exports.associateRouteTable = associateRouteTable;
exports.createPublicRoute = createPublicRoute;
