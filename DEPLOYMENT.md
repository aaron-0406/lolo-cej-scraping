# Deployment Guide: lolo-cej-scraping on AWS (EC2 + Docker)

This guide covers deploying the CEJ scraping microservice to AWS using the **AWS Management Console** (browser), then SSH for Docker setup.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [IAM Role](#2-iam-role)
3. [Security Groups](#3-security-groups)
4. [EC2 Instance Setup](#4-ec2-instance-setup)
5. [ElastiCache Redis](#5-elasticache-redis)
6. [Install Docker on EC2 (SSH)](#6-install-docker-on-ec2-ssh)
7. [Deploy the Application (SSH)](#7-deploy-the-application-ssh)
8. [Production Docker Compose](#8-production-docker-compose)
9. [Environment Variables](#9-environment-variables)
10. [Connect lolo-backend to lolo-cej-scraping](#10-connect-lolo-backend-to-lolo-cej-scraping)
11. [CloudWatch Logging](#11-cloudwatch-logging)
12. [Health Check & Monitoring](#12-health-check--monitoring)
13. [SSL & Network Considerations](#13-ssl--network-considerations)
14. [Maintenance & Operations](#14-maintenance--operations)

---

## 1. Prerequisites

Before starting, have ready:

- Access to the **AWS Management Console** (browser)
- An SSH key pair (or create one during EC2 launch)
- The **VPC ID** and **subnet** where lolo-backend runs (find in **EC2 > Instances > your lolo-backend instance > Networking tab**)
- The **RDS endpoint** for `db_lolo` (find in **RDS > Databases > your database > Connectivity & security**)
- The **security group ID** of the lolo-backend EC2 instance
- The **security group ID** of the RDS instance
- A CapSolver/2Captcha API key
- A strong shared secret for `SERVICE_SECRET`

---

## 2. IAM Role

Create an IAM role so the EC2 instance can access S3 and CloudWatch without hardcoded keys.

### Steps

1. Go to **IAM > Roles > Create role**
2. **Trusted entity type:** AWS service
3. **Use case:** EC2 — click **Next**
4. **Skip adding managed policies** (we'll create a custom one) — click **Next**
5. **Role name:** `lolo-cej-scraping-role`
6. Click **Create role**

### Add Inline Policy

1. Open the role you just created
2. Go to the **Permissions** tab > **Add permissions > Create inline policy**
3. Switch to **JSON** editor and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::archivosstorage/*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:us-west-2:*:log-group:/ecs/lolo-cej-scraping:*"
    }
  ]
}
```

4. **Policy name:** `lolo-cej-scraping-policy`
5. Click **Create policy**

---

## 3. Security Groups

### 3.1 Create the Scraper Security Group

1. Go to **EC2 > Security Groups > Create security group**
2. Fill in:
   - **Name:** `lolo-cej-scraping-sg`
   - **Description:** Security group for CEJ scraping service
   - **VPC:** Select the **same VPC** as lolo-backend

#### Inbound Rules

Click **Add rule** for each:

| Type | Port | Source | Description |
|------|------|--------|-------------|
| Custom TCP | 4000 | Select **Custom** and type the lolo-backend security group ID (e.g., `sg-XXXXX`) | API from lolo-backend |
| SSH | 22 | **My IP** | SSH access (remove after setup) |

#### Outbound Rules

Leave the **default rule** (All traffic, 0.0.0.0/0). The scraper needs outbound access to:
- `cej.pj.gob.pe` (port 443) — Court website
- CapSolver/2Captcha (port 443) — CAPTCHA solving
- S3 (port 443) — File uploads
- RDS (port 3306) — Database
- ElastiCache (port 6379) — Redis

3. Click **Create security group**

### 3.2 Update the RDS Security Group

1. Go to **EC2 > Security Groups**
2. Find and select the **RDS security group** (the one used by your lolo database)
3. Click **Inbound rules > Edit inbound rules > Add rule**

| Type | Port | Source | Description |
|------|------|--------|-------------|
| MySQL/Aurora | 3306 | Select the `lolo-cej-scraping-sg` you just created | CEJ scraper DB access |

4. Click **Save rules**

---

## 4. EC2 Instance Setup

### Recommended: t3.xlarge (4 vCPU, 16 GB RAM)

Puppeteer + Chromium is memory-intensive. Each browser instance uses ~300-500 MB. With a pool of 5 browsers, expect ~2-4 GB for browsers alone.

### Launch Steps

1. Go to **EC2 > Instances > Launch instances**
2. Fill in:

| Setting | Value |
|---------|-------|
| **Name** | `lolo-cej-scraping` |
| **AMI** | Amazon Linux 2023 (free tier eligible, but we need a bigger instance) |
| **Instance type** | t3.xlarge |
| **Key pair** | Select existing or create new |
| **Network settings** | Click **Edit** |
| — VPC | Same VPC as lolo-backend |
| — Subnet | Same subnet as lolo-backend (or another in same VPC) |
| — Auto-assign public IP | Enable (needed for SSH and outbound internet; or use NAT if private subnet) |
| — Security group | Select **existing** > `lolo-cej-scraping-sg` |
| **IAM instance profile** | Under **Advanced details** > IAM instance profile > `lolo-cej-scraping-role` |
| **Storage** | 30 GB gp3 |

3. Click **Launch instance**

### Note the Private IP

After launch, go to the instance details and note the **Private IPv4 address** (e.g., `10.0.1.50`). You'll need this to configure lolo-backend.

---

## 5. ElastiCache Redis

BullMQ requires Redis for job queues.

### 5.1 Create a Subnet Group

1. Go to **ElastiCache > Subnet groups > Create subnet group**
2. Fill in:
   - **Name:** `lolo-redis-subnet`
   - **VPC:** Same VPC as lolo-backend
   - **Subnets:** Select the subnets where your EC2 instances run
3. Click **Create**

### 5.2 Create a Security Group for Redis

1. Go to **EC2 > Security Groups > Create security group**
2. Fill in:
   - **Name:** `lolo-redis-sg`
   - **Description:** Redis access for lolo-cej-scraping
   - **VPC:** Same VPC

#### Inbound Rules

| Type | Port | Source | Description |
|------|------|--------|-------------|
| Custom TCP | 6379 | `lolo-cej-scraping-sg` | Redis from scraper |

3. Click **Create security group**

### 5.3 Create the Redis Cluster

1. Go to **ElastiCache > Redis OSS caches > Create Redis OSS cache**
2. Configure:

| Setting | Value |
|---------|-------|
| **Cluster mode** | Disabled |
| **Name** | `lolo-redis` |
| **Node type** | cache.t3.small |
| **Number of replicas** | 0 (single node is fine for this use case) |
| **Subnet group** | `lolo-redis-subnet` |
| **Security group** | `lolo-redis-sg` |
| **Encryption at rest** | Optional |
| **Encryption in transit** | Leave disabled (internal VPC only) |

3. Click **Create**
4. Wait for status to become **Available**
5. Click on the cluster name > note the **Primary endpoint** (e.g., `lolo-redis.XXXXXX.0001.usw2.cache.amazonaws.com`). Use this as `REDIS_HOST`.

### Alternative: Redis in Docker (Fallback)

If you prefer to skip ElastiCache (e.g., for cost), you can run Redis in Docker alongside the scraper. See [Section 8, Option B](#option-b-docker-redis-fallback).

---

## 6. Install Docker on EC2 (SSH)

Connect to the instance. You can either:
- Use **EC2 Instance Connect** from the console (Instances > select instance > Connect > EC2 Instance Connect tab > Connect)
- Or SSH from your terminal: `ssh -i your-key.pem ec2-user@<PUBLIC-IP>`

Then run these commands:

```bash
# Update system
sudo dnf update -y

# Install Docker
sudo dnf install -y docker
sudo systemctl enable docker
sudo systemctl start docker

# Add ec2-user to docker group (avoids needing sudo for docker commands)
sudo usermod -aG docker ec2-user

# Install Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Log out and back in for group changes
exit
```

Reconnect, then verify:

```bash
docker --version
docker compose version
```

---

## 7. Deploy the Application (SSH)

### Clone the Repository

```bash
sudo mkdir -p /opt/lolo-cej-scraping
sudo chown ec2-user:ec2-user /opt/lolo-cej-scraping

# Clone (use HTTPS + personal access token, or deploy key)
git clone https://github.com/YOUR_ORG/lolo-cej-scraping.git /opt/lolo-cej-scraping
cd /opt/lolo-cej-scraping
```

> If git is not installed: `sudo dnf install -y git`

### Build the Docker Image

```bash
cd /opt/lolo-cej-scraping
docker build -t lolo-cej-scraping:latest .
```

This uses the existing multi-stage Dockerfile:
- Stage 1: Builds TypeScript in Alpine Node 18
- Stage 2: Runs in Debian Slim with system Chromium
- Runs as non-root `scraper` user
- Exposes port 4000

---

## 8. Production Docker Compose

Create the file `/opt/lolo-cej-scraping/docker-compose.prod.yml`:

### Option A: ElastiCache Redis (Recommended)

```yaml
version: "3.8"

services:
  scraper:
    image: lolo-cej-scraping:latest
    container_name: lolo-cej-scraping
    ports:
      - "4000:4000"
    env_file:
      - .env
    restart: unless-stopped
    logging:
      driver: awslogs
      options:
        awslogs-region: us-west-2
        awslogs-group: /ecs/lolo-cej-scraping
        awslogs-stream-prefix: scraper
        awslogs-create-group: "true"
    deploy:
      resources:
        limits:
          memory: 12G
        reservations:
          memory: 4G
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:4000/api/scraping/v1/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
```

### Option B: Docker Redis (Fallback)

```yaml
version: "3.8"

services:
  redis:
    image: redis:7-alpine
    container_name: lolo-redis
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    logging:
      driver: awslogs
      options:
        awslogs-region: us-west-2
        awslogs-group: /ecs/lolo-cej-scraping
        awslogs-stream-prefix: redis
        awslogs-create-group: "true"

  scraper:
    image: lolo-cej-scraping:latest
    container_name: lolo-cej-scraping
    ports:
      - "4000:4000"
    env_file:
      - .env
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: awslogs
      options:
        awslogs-region: us-west-2
        awslogs-group: /ecs/lolo-cej-scraping
        awslogs-stream-prefix: scraper
        awslogs-create-group: "true"
    deploy:
      resources:
        limits:
          memory: 12G
        reservations:
          memory: 4G
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:4000/api/scraping/v1/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

volumes:
  redis-data:
```

### Create the File and Start

```bash
# Create the file (use nano, vim, or copy from your machine)
nano /opt/lolo-cej-scraping/docker-compose.prod.yml
# Paste the content above, save and exit

# Start
cd /opt/lolo-cej-scraping
docker compose -f docker-compose.prod.yml up -d
```

---

## 9. Environment Variables

Create `/opt/lolo-cej-scraping/.env`:

```bash
nano /opt/lolo-cej-scraping/.env
```

Paste and fill in:

```bash
# --- Server ---
PORT=4000
NODE_ENV=production
LOG_LEVEL=info

# --- Database (existing RDS — find endpoint in RDS > Databases > Connectivity) ---
DB_USER=your_rds_username
DB_PASSWORD=your_rds_password
DB_HOST=your-rds-endpoint.us-west-2.rds.amazonaws.com
DB_PORT=3306
DB_NAME=db_lolo

# --- Redis ---
# If using ElastiCache: paste the primary endpoint from ElastiCache console
REDIS_HOST=lolo-redis.XXXXXX.0001.usw2.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=
# If using Docker Redis (Option B): leave these as-is, docker-compose overrides them

# --- AWS S3 ---
AWS_BUCKET_NAME=archivosstorage
AWS_BUCKET_REGION=us-west-2
# Leave empty when using IAM role (recommended):
AWS_PUBLIC_KEY=
AWS_SECRET_KEY=
AWS_CHB_PATH=CHB/

# --- CAPTCHA Solving ---
CAPTCHA_API_KEY=your-capsolver-or-2captcha-api-key

# --- CEJ Website ---
CEJ_BASE_URL=https://cej.pj.gob.pe/cej/forms/busquedaform.html

# --- Worker Configuration ---
# On t3.xlarge (16 GB), you can use 5. Monitor memory and adjust.
BROWSER_POOL_SIZE=5
MAX_PAGES_PER_BROWSER=20
WORKER_CONCURRENCY=5
PAGE_TIMEOUT_MS=30000
NAVIGATION_TIMEOUT_MS=15000

# --- Rate Limiting ---
RATE_LIMIT_MAX=10
RATE_LIMIT_DURATION_MS=60000

# --- Scheduler ---
SCHEDULER_INTERVAL_MINUTES=10

# --- Service Authentication (must match lolo-backend config) ---
SERVICE_SECRET=your-strong-shared-secret-here
```

Secure the file:

```bash
chmod 600 /opt/lolo-cej-scraping/.env
```

---

## 10. Connect lolo-backend to lolo-cej-scraping

### Find the Scraper's Private IP

1. Go to **EC2 > Instances**
2. Select `lolo-cej-scraping`
3. In the **Details** tab, copy the **Private IPv4 address** (e.g., `10.0.1.50`)

### Update lolo-backend

SSH into the lolo-backend EC2 instance and add to its `.env`:

```bash
# CEJ Scraping Service
CEJ_SCRAPING_URL=http://10.0.1.50:4000
CEJ_SCRAPING_SECRET=your-strong-shared-secret-here
```

> The `CEJ_SCRAPING_SECRET` must be the **same value** as `SERVICE_SECRET` in the scraper's `.env`.

Restart lolo-backend to pick up the new variables.

### Verify Connectivity

From the lolo-backend EC2 instance:

```bash
curl http://10.0.1.50:4000/api/scraping/v1/health
```

Expected response:

```json
{
  "status": "healthy",
  "uptime": 120,
  "checks": {
    "database": { "status": "up", "latency": 5 },
    "redis": { "status": "up", "latency": 2 },
    "browserPool": { "status": "up", "active": 0, "available": 5, "max": 5 }
  }
}
```

---

## 11. CloudWatch Logging

The `docker-compose.prod.yml` already uses the `awslogs` driver, which sends container logs directly to CloudWatch. No extra agent installation is needed on Amazon Linux 2023.

### View Logs in the Console

1. Go to **CloudWatch > Log groups**
2. Find `/ecs/lolo-cej-scraping`
3. Click into it to see log streams (`scraper/...` and optionally `redis/...`)
4. Click a stream to view logs

### Set Log Retention

1. In **CloudWatch > Log groups**, select `/ecs/lolo-cej-scraping`
2. Click **Actions > Edit retention setting**
3. Set to **30 days** (or your preference)
4. Click **Save**

### Create an Alarm (Optional)

1. Go to **CloudWatch > Alarms > Create alarm**
2. **Select metric:** EC2 > Per-Instance Metrics > find `lolo-cej-scraping` > `StatusCheckFailed`
3. **Conditions:** Greater than or equal to 1
4. **Period:** 5 minutes
5. **Notification:** Create or select an SNS topic to receive email alerts
6. **Name:** `lolo-cej-scraping-unhealthy`
7. Click **Create alarm**

---

## 12. Health Check & Monitoring

### Health Endpoint

`GET /api/scraping/v1/health` — no authentication required.

| Component | What It Checks |
|-----------|----------------|
| Database | MySQL connection via Sequelize `authenticate()` |
| Redis | `PING` command via ioredis |
| Browser Pool | Pool availability and active count |

### Response Codes

| HTTP | Status | Meaning |
|------|--------|---------|
| 200 | `healthy` | All systems operational |
| 503 | `degraded` / `unhealthy` | One or more checks failing |

### Docker Auto-Restart

The `healthcheck` in `docker-compose.prod.yml` checks the health endpoint every 30 seconds. After 3 consecutive failures, Docker marks the container as unhealthy. Combined with `restart: unless-stopped`, the container automatically restarts on crash.

### Simple Monitoring from lolo-backend

You can add a cron job on the lolo-backend EC2 to check the scraper:

```bash
crontab -e
```

Add:

```
*/5 * * * * curl -sf http://<SCRAPER_PRIVATE_IP>:4000/api/scraping/v1/health > /dev/null || echo "CEJ Scraper unhealthy at $(date)" >> /var/log/scraper-check.log
```

---

## 13. SSL & Network Considerations

### Internal Communication (lolo-backend <-> scraper)

Both services are in the **same VPC**, so they communicate over the private network on port 4000. **TLS is not needed** for this internal traffic — security groups restrict who can connect.

### Outbound Internet Access

The scraper needs HTTPS (443) access to:

| Destination | Purpose |
|-------------|---------|
| `cej.pj.gob.pe` | Court website scraping |
| `api.capsolver.com` / `2captcha.com` | CAPTCHA solving |
| `archivosstorage.s3.us-west-2.amazonaws.com` | S3 uploads |

If the instance has a **public IP** or is in a **public subnet**, this works out of the box.

If the instance is in a **private subnet**, you need a NAT Gateway:

1. Go to **VPC > NAT gateways > Create NAT gateway**
2. Select a **public subnet**, allocate an Elastic IP
3. Go to **VPC > Route tables**, find the route table for the private subnet
4. Add route: **Destination** `0.0.0.0/0` → **Target** the NAT gateway

### S3 VPC Endpoint (saves NAT costs)

1. Go to **VPC > Endpoints > Create endpoint**
2. **Service:** `com.amazonaws.us-west-2.s3` (Gateway type)
3. **VPC:** Your VPC
4. **Route tables:** Select the route table(s) for your private subnet(s)
5. Click **Create endpoint**

This routes S3 traffic through the AWS network instead of the NAT gateway, reducing costs.

---

## 14. Maintenance & Operations

### Deploying Updates

SSH into the scraper EC2:

```bash
cd /opt/lolo-cej-scraping

# Pull latest code
git pull origin main

# Rebuild image
docker build -t lolo-cej-scraping:latest .

# Restart with new image
docker compose -f docker-compose.prod.yml up -d --force-recreate scraper
```

### Viewing Logs

```bash
# Recent logs
docker logs lolo-cej-scraping --tail 100

# Follow logs in real time
docker logs lolo-cej-scraping -f

# Or check CloudWatch in the browser (see Section 11)
```

### Checking Resource Usage

```bash
docker stats lolo-cej-scraping
```

Watch the **MEM USAGE** column. If it approaches the limit, reduce `BROWSER_POOL_SIZE` and `WORKER_CONCURRENCY` in `.env`.

### Restarting

```bash
docker compose -f docker-compose.prod.yml restart scraper
```

### Auto-Restart on EC2 Reboot

Docker is set to start on boot (`systemctl enable docker`), and the container has `restart: unless-stopped`. After an EC2 reboot, the container starts automatically.

### Scaling Concurrency

Edit `.env`:

```bash
BROWSER_POOL_SIZE=7
WORKER_CONCURRENCY=7
```

Then restart:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate scraper
```

Each browser uses ~300-500 MB RAM. On t3.xlarge (16 GB), stay under `BROWSER_POOL_SIZE=8` to leave headroom.

### Backup Notes

- **Database:** Handled by RDS automated backups (already configured)
- **Redis:** ElastiCache supports automatic backups. Docker Redis persists to a volume but is less reliable.
- **Application:** Stateless. The EC2 instance can be replaced at any time — just redeploy.

---

## Quick Start Checklist

```
[ ]  1. Create IAM role `lolo-cej-scraping-role` with S3 + CloudWatch policy
[ ]  2. Create security group `lolo-cej-scraping-sg` (port 4000 from backend SG, SSH from your IP)
[ ]  3. Update RDS security group to allow port 3306 from `lolo-cej-scraping-sg`
[ ]  4. Launch EC2 t3.xlarge with the IAM role and security group (same VPC as backend)
[ ]  5. Create ElastiCache Redis `lolo-redis` (cache.t3.small) with its own SG
         — or skip and use Docker Redis (Option B)
[ ]  6. SSH into EC2, install Docker & Docker Compose
[ ]  7. Clone repo to /opt/lolo-cej-scraping
[ ]  8. Create .env with production values (RDS endpoint, Redis endpoint, secrets)
[ ]  9. Create docker-compose.prod.yml
[ ] 10. Build: docker build -t lolo-cej-scraping:latest .
[ ] 11. Start: docker compose -f docker-compose.prod.yml up -d
[ ] 12. Verify: curl http://localhost:4000/api/scraping/v1/health
[ ] 13. Update lolo-backend .env with CEJ_SCRAPING_URL and CEJ_SCRAPING_SECRET
[ ] 14. Restart lolo-backend
[ ] 15. Test end-to-end: trigger a scraping job from lolo-backend
[ ] 16. Verify CloudWatch logs are flowing
[ ] 17. Remove SSH (port 22) rule from security group
[ ] 18. Set CloudWatch log retention to 30 days
```
