const aws = require("@pulumi/aws");

function createInternetGateway(vpcId) {
  return new aws.ec2.InternetGateway("myIG", {
    vpcId: vpcId,
    tags: {
      Name: "Internet Gateway",
    },
  });
}

exports.createInternetGateway = createInternetGateway;
