# AWS VPC Setup with Pulumi

This project sets up a VPC with public and private subnets in a given AWS region using Pulumi.

## Prerequisites

- **AWS CLI**: Ensure AWS CLI is configured with the required credentials.
- **Pulumi CLI**: Needed for IaC (Infrastructure as Code) operations.
- **Node.js**: Required for the Pulumi JavaScript SDK.

## Setup

1. **Clone the Repository**:
   
2. **Install Dependencies**:


### Added certificate
 
- aws acm import-certificate --certificate file://Certificate.pem --certificate-chain file://CertificateChain.pem --private-key file://PrivateKey.pem --profile demo


