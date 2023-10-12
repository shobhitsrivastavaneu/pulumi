const aws = require("@pulumi/aws");

function createSubnets(vpc, azs, type, count, baseCidrBlock, ipValue, baseVal) {
  const subnets = [];
  const base = baseVal;
  const baseOctets = baseCidrBlock.split(".");
  let thirdOctet = parseInt(baseOctets[2], 10);
  for (let i = 0; i < count; i++) {
    const cidrBlock = `${baseOctets[0]}.${baseOctets[1]}.${
      thirdOctet + base + i
    }.${baseOctets[3]}/24`;
    subnets.push(
      new aws.ec2.Subnet(
        `${type}Subnet-${i}`,
        {
          cidrBlock: cidrBlock,
          vpcId: vpc.id,
          name: `My ${type.charAt(0).toUpperCase() + type.slice(1)} Subnet`,
          mapPublicIpOnLaunch: type === "public",
          availabilityZone: azs.then((az) => az.names[i]),
        },
        { dependsOn: [vpc] }
      )
    );
  }
  return subnets;
}

exports.createSubnets = createSubnets;
