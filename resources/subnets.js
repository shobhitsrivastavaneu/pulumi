const aws = require("@pulumi/aws");

function createSubnets(vpc, azs, type, count) {
  const subnets = [];
  const base = type === "public" ? 0 : 3;

  for (let i = 0; i < count; i++) {
    subnets.push(
      new aws.ec2.Subnet(`${type}Subnet-${i}`, {
        cidrBlock: `10.0.${base + i}.0/24`,
        vpcId: vpc.id,
        name: `My ${type.charAt(0).toUpperCase() + type.slice(1)} Subnet`,
        mapPublicIpOnLaunch: type === "public",
        availabilityZone: azs.then((az) => az.names[i]),
      },{ dependsOn: [vpc] })
    );
  }
  return subnets;
}

exports.createSubnets = createSubnets;
