const aws = require("@pulumi/aws");

function createVpc(cidrBlock) {
    return new aws.ec2.Vpc("myVPC", {
        cidrBlock: cidrBlock,
        enableDnsSupport: true,
        enableDnsHostnames: true,
    });
}

exports.createVpc = createVpc;
