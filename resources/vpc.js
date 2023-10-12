const aws = require("@pulumi/aws");

createVpc = (cidrBlock, ipRange) => {
  const cidrBlk = `${cidrBlock}/${ipRange}`;
  return new aws.ec2.Vpc("myVPC", {
    cidrBlock: cidrBlk,
    enableDnsSupport: true,
    enableDnsHostnames: true,
  });
};

exports.createVpc = createVpc;
