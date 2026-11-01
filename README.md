# End-to-End DevSecOps Project

A complete DevSecOps pipeline that takes a Node.js website from source code to a secured, monitored deployment on **AWS EKS**.

> Every commit runs through unit tests, static code analysis, a container build, a vulnerability scan, and an automatic Kubernetes deployment, with metrics and alerts on top.

## Architecture

```
Developer ─► GitLab ─► CI/CD Pipeline
                         │
   ┌─────────────────────┼───────────────────────────────────────┐
   │ 1. Test      2. Quality     3. Build        4. Security   5. Deploy
   │ node --test  SonarQube      Docker build    Trivy scan    kubectl apply
   │                             + push to       (HIGH/CRIT    to EKS
   │                             Docker Hub      fails build)
   └─────────────────────────────────────────────────────────────┘
                                                        │
                      AWS (provisioned with Terraform)  ▼
                  VPC ─► EKS cluster ─► Deployment (2 replicas)
                                         │            ▲
                    ALB Ingress ◄────────┘            │ scrape /metrics
                                                      │
                         Prometheus ─► Alertmanager (email) ─► Grafana
```

## Tech Stack

| Area | Tools |
|------|-------|
| Application | Node.js 20+ (no dependencies), `node:test` |
| CI/CD | GitLab CI |
| Code quality | SonarQube 25.3 (self-hosted on EC2) |
| Containers | Docker (Alpine, non-root user), Docker Hub |
| Security | Trivy image scanning |
| Infrastructure as Code | Terraform (VPC, IAM, EKS, managed node group) |
| Orchestration | Kubernetes on AWS EKS, AWS Load Balancer Controller (ALB) |
| Observability | Prometheus, Alertmanager (email alerts), Grafana via `kube-prometheus-stack` |

## Repository Structure

```
├── public/                  # Website (HTML + CSS)
├── src/server.js            # HTTP server with /healthz and /metrics
├── test/server.test.js      # Unit tests
├── Dockerfile
├── sonar-project.properties
├── .gitlab-ci.yml           # 5-stage pipeline
├── terraform/               # VPC + EKS cluster
├── k8s/
│   ├── app/                 # Deployment, Service, Ingress, ServiceMonitor
│   └── monitoring/          # PrometheusRule, AlertmanagerConfig, Helm values
├── scripts/                 # SonarQube + AWS LB Controller install scripts
└── docs/screenshots/        # Add your screenshots here
```

## The Pipeline

| Stage | Job | What it does |
|-------|-----|--------------|
| test | `unit_tests` | Runs `npm test` |
| quality | `sonarqube_scan` | Static analysis on the SonarQube server |
| build | `build_and_push_image` | Builds the image and pushes it to Docker Hub, tagged with the pipeline ID |
| security | `trivy_image_scan` | Fails the pipeline on HIGH/CRITICAL vulnerabilities |
| deploy | `deploy_to_eks` | Injects the image tag and applies the manifests to EKS |

### CI/CD variables (GitLab → Settings → CI/CD → Variables)

| Variable | Description |
|----------|-------------|
| `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` | Docker Hub login (use an access token, masked) |
| `SONAR_HOST_URL` | e.g. `http://<EC2_PUBLIC_IP>:9000` |
| `SONAR_TOKEN` | SonarQube token (masked) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IAM credentials (masked) |
| `AWS_REGION` | e.g. `us-east-1` |
| `EKS_CLUSTER_NAME` | `end-to-end-devops-eks` |

## Run Locally

```bash
npm test
npm start            # http://localhost:3000
curl localhost:3000/healthz
curl localhost:3000/metrics
```

With Docker:

```bash
docker build -t devsecops-demo .
docker run -p 3000:3000 devsecops-demo
```

## Deploy to AWS

> **Cost warning:** EKS is not covered by the AWS Free Tier. Run `terraform destroy` when you finish, and set an AWS Budget alert.

1. **Provision the cluster**
   ```bash
   cd terraform
   terraform init
   terraform apply
   aws eks update-kubeconfig --name end-to-end-devops-eks --region us-east-1
   kubectl get nodes
   ```
2. **Install the AWS Load Balancer Controller**
   ```bash
   AWS_ACCOUNT_ID=<id> VPC_ID=$(terraform output -raw vpc_id) ./scripts/install-aws-lb-controller.sh
   ```
3. **Create namespaces and the SMTP secret** (never commit the password)
   ```bash
   kubectl create namespace devops-project
   kubectl create namespace monitoring
   kubectl -n devops-project create secret generic alertmanager-smtp-secret \
     --from-literal=smtp-password='<gmail-app-password>'
   ```
   Then edit `k8s/monitoring/alertmanager-config.yaml` and set your email address.
4. **Install Prometheus + Grafana**
   ```bash
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm repo update
   helm install prometheus prometheus-community/kube-prometheus-stack \
     --namespace monitoring \
     --values k8s/monitoring/kube-prometheus-stack-values.yaml \
     --set grafana.adminPassword='<strong-password>'
   ```
5. **Set up SonarQube** on a separate EC2 instance (4 GB RAM or more):
   ```bash
   SONAR_PASS='<db-password>' ./scripts/sonarqube.sh
   ```
6. **Push to GitLab** and let the pipeline deploy the app.

## Verify

```bash
kubectl get pods,svc,ingress -n devops-project
kubectl get servicemonitor,prometheusrule -n devops-project
```

Trigger the alert with a load test (the rule fires above 20 requests per minute on `/`):

```bash
ab -n 1200 -c 10 http://<ALB_DNS_NAME>/
```

## Screenshots

Add yours to `docs/screenshots/` and link them here:

- Successful pipeline run
- SonarQube dashboard
- Trivy scan output
- Website on the ALB URL
- Grafana dashboard
- Alert e-mail

## Security Notes

- No secrets in the repo: credentials come from CI/CD variables and Kubernetes secrets.
- The container runs as a non-root user.
- Trivy blocks the release if HIGH or CRITICAL vulnerabilities are found.
- For production, also consider private subnets for the nodes, a remote Terraform state backend (S3 + DynamoDB), and restricting the Grafana/Prometheus services.

## License

MIT
