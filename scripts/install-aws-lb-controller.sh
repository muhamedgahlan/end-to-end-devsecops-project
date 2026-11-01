#!/bin/bash
# Installs the AWS Load Balancer Controller on the EKS cluster.
# Requires: aws cli (configured), kubectl, helm, eksctl.
# Usage: AWS_ACCOUNT_ID=123456789012 VPC_ID=vpc-xxxx ./install-aws-lb-controller.sh

set -e

CLUSTER_NAME="${CLUSTER_NAME:-end-to-end-devops-eks}"
REGION="${REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"
VPC_ID="${VPC_ID:?Set VPC_ID (terraform output vpc_id)}"

helm repo add eks https://aws.github.io/eks-charts
helm repo update

eksctl utils associate-iam-oidc-provider --cluster "$CLUSTER_NAME" --approve

curl -o iam-policy.json \
  https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam-policy.json

eksctl create iamserviceaccount \
  --cluster "$CLUSTER_NAME" \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy" \
  --approve

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName="$CLUSTER_NAME" \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region="$REGION" \
  --set vpcId="$VPC_ID"

kubectl get deployment -n kube-system aws-load-balancer-controller
