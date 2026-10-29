# Hosting Cost and Requirement Report

Date: 03 July 2026

## 1. Scope

This report compares two hosting options for a learning platform with approximately 500 students:

- Option A: AWS services
- Option B: Own physical server

Main workloads:

- Judge0 code execution
- Video hosting/streaming
- Platform API connectivity
- Monitoring, backups, and security

## 2. Base Assumptions

- Student count: 500
- Judge0 usage: normal learning platform usage, not all 500 students submitting at the exact same second
- Video quality: 720p to 1080p
- Video delivery: students watch videos online, not only download once
- Existing own server: i9 CPU, 8 cores, 32 GB RAM, 2 TB storage, Ubuntu
- Prices are approximate and should be verified in AWS Pricing Calculator before purchase

## 3. AWS Option

### 3.1 Recommended AWS Architecture

- Compute for Judge0: Amazon Lightsail or EC2
- Storage for videos: Amazon S3
- Video delivery: Amazon CloudFront CDN
- Database: PostgreSQL on the same Judge0 server for small scale, or Amazon RDS for managed setup
- Cache/queue: Redis on the same Judge0 server for small scale, or ElastiCache for managed setup
- DNS: Route 53 or Cloudflare
- SSL: AWS Certificate Manager or reverse proxy SSL
- Monitoring: CloudWatch
- Backups: EBS snapshots or S3 backups

### 3.2 AWS Services Required

| Requirement | AWS Service |
|---|---|
| Judge0 server | Lightsail 8 vCPU / 32 GB RAM or EC2 equivalent |
| Code execution workers | Same server initially; separate EC2 workers later |
| Video file storage | S3 Standard |
| Video CDN | CloudFront |
| Domain/DNS | Route 53 or Cloudflare |
| SSL | ACM or Caddy/Nginx with Let's Encrypt |
| Logs/metrics | CloudWatch |
| Backups | EBS snapshots / S3 |

### 3.3 AWS Monthly Cost Estimate

#### Judge0 Only

| Item | Estimated Monthly Cost |
|---|---:|
| Lightsail 32 GB RAM, 8 vCPU, 640 GB SSD, 7 TB transfer | $164/month |
| Backups/snapshots | $10-$30/month |
| Monitoring/logs | $0-$20/month |
| Domain/DNS | $1-$5/month |
| Total for Judge0 only | $175-$220/month |

This is enough for the first production version of Judge0 for 500 students.

#### Video Hosting on AWS

Video cost depends mainly on watch time and bandwidth.

Approximate bandwidth:

| Quality | Average Bitrate | Data Per Student Per Hour |
|---|---:|---:|
| 720p | 2.5 Mbps | ~1.1 GB/hour |
| 1080p | 5 Mbps | ~2.25 GB/hour |

Example monthly bandwidth:

| Usage Case | Calculation | Monthly Data |
|---|---|---:|
| Light | 500 students x 5 hours x 1.1 GB | ~2.75 TB |
| Medium | 500 students x 10 hours x 1.1 GB | ~5.5 TB |
| Heavy | 500 students x 20 hours x 1.1 GB | ~11 TB |

Approximate video AWS cost:

| Item | Light Usage | Medium Usage | Heavy Usage |
|---|---:|---:|---:|
| S3 storage, assuming 1 TB videos | ~$23/month | ~$23/month | ~$23/month |
| CloudFront/data transfer | ~$230-$300/month | ~$450-$600/month | ~$900-$1,100/month |
| Requests/operations | $5-$30/month | $10-$50/month | $20-$100/month |
| Total video cost | $260-$350/month | $480-$670/month | $950-$1,220/month |

### 3.4 AWS Total Monthly Estimate

| Setup | Estimated Monthly Cost |
|---|---:|
| Judge0 only on AWS | $175-$220/month |
| Judge0 + light video hosting | $435-$570/month |
| Judge0 + medium video hosting | $655-$890/month |
| Judge0 + heavy video hosting | $1,125-$1,440/month |

### 3.5 AWS Benefits

- Better uptime than a home/office server
- Easier public IP, SSL, and DNS setup
- CDN can handle many students watching videos at once
- Backups and monitoring are easier
- Scaling is easier by adding more EC2 workers

### 3.6 AWS Challenges

- Monthly cost increases with video bandwidth
- CloudFront and S3 billing must be monitored carefully
- Misconfigured public access can create security risk
- Judge0 still needs strong sandboxing and rate limiting
- AWS cost can grow quickly during high video usage

## 4. Own Server Option

### 4.1 Recommended Own Server Architecture

- OS: Ubuntu Server 24.04 LTS
- Runtime: Docker and Docker Compose
- Judge0: Judge0 CE
- Reverse proxy: Caddy or Nginx
- SSL: Let's Encrypt
- Firewall: UFW
- Intrusion protection: Fail2ban
- Monitoring: Uptime Kuma + Netdata
- Backups: local backup + external/cloud backup
- Public access: static public IP, Cloudflare Tunnel, or VPS reverse proxy

### 4.2 Own Server Services Required

| Requirement | Recommended Tool |
|---|---|
| Judge0 API | Judge0 CE |
| Containers | Docker Compose |
| Database | PostgreSQL container |
| Queue/cache | Redis container |
| Reverse proxy | Caddy or Nginx |
| SSL | Let's Encrypt |
| Firewall | UFW |
| Monitoring | Uptime Kuma + Netdata |
| Backups | Cron + PostgreSQL dump + external backup |

### 4.3 Own Server Monthly Cost Estimate

| Item | Estimated Monthly Cost |
|---|---:|
| Existing i9 server hardware | $0 if already owned |
| Electricity | $15-$50/month |
| Internet connection | existing cost or $20-$100/month extra |
| Static IP, if required | $5-$25/month |
| Domain | ~$1-$2/month |
| Cloudflare Tunnel | $0 for basic use |
| External backup storage | $5-$20/month |
| UPS/power backup allowance | optional one-time cost |
| Total for Judge0 only | $25-$100/month |

### 4.4 Own Server Capacity

Your current server is enough for Judge0 for 500 students:

| Resource | Status |
|---|---|
| CPU: 8 cores | Enough for initial Judge0 |
| RAM: 32 GB | Enough |
| Storage: 2 TB | More than enough for Judge0 |
| OS: Ubuntu | Good |

Recommended starting Judge0 configuration:

| Setting | Starting Value |
|---|---:|
| Workers | 8-10 |
| CPU time limit | 3-5 seconds |
| Wall time limit | 10-15 seconds |
| Memory limit | 128-256 MB |
| Max queue size | 500 |

### 4.5 Own Server Video Hosting Cost and Requirement

Video hosting is the main risk for own server.

Required upload bandwidth:

| Quality | Bandwidth for 500 Concurrent Students |
|---|---:|
| 720p at 2.5 Mbps | ~1.25 Gbps upload |
| 1080p at 5 Mbps | ~2.5 Gbps upload |

Most home/office connections cannot provide stable 1-3 Gbps upload. Therefore, own server is not recommended for direct video streaming to 500 students.

### 4.6 Own Server Benefits

- Lowest monthly cost for Judge0
- Full control over server and configuration
- Good use of existing hardware
- No AWS compute cost for Judge0

### 4.7 Own Server Challenges

- Public IP or tunneling setup is required
- Power failure can stop the judge
- Internet outage can stop the judge
- Security responsibility is fully yours
- Hardware failure recovery is your responsibility
- Video streaming requires very high upload bandwidth
- Monitoring and backup discipline is mandatory

## 5. Direct Comparison

| Area | AWS | Own Server |
|---|---|---|
| Judge0 monthly cost | ~$175-$220 | ~$25-$100 |
| Video monthly cost | Medium to high | Low cost but bandwidth problem |
| Uptime | Better | Depends on power/internet |
| Scaling | Easy | Limited by hardware |
| Security work | Medium | High |
| Setup complexity | Medium | Medium-high |
| Best use | Production + video CDN | Judge0 compute |

## 6. Final Recommendation

Use a hybrid setup:

- Host Judge0 on your own i9 Ubuntu server.
- Keep videos on YouTube, or move videos to S3 + CloudFront / Bunny Stream / Mux only when needed.
- Do not directly stream videos from your own server for 500 students.
- Use Cloudflare Tunnel or a VPS reverse proxy if you do not have a static public IP.
- Add monitoring, rate limiting, backups, and firewall before production use.

Best practical setup:

| Workload | Recommended Hosting |
|---|---|
| Judge0 | Own i9 server |
| Videos | YouTube/CDN |
| Main app backend | Current cloud/server |
| Database backups | Cloud backup |
| Monitoring | Uptime Kuma + Netdata |

## 7. Sources

- AWS Lightsail pricing: https://aws.amazon.com/lightsail/pricing/
- AWS EC2 pricing: https://aws.amazon.com/ec2/pricing/on-demand/
- AWS EBS pricing: https://aws.amazon.com/ebs/pricing/
- AWS S3 pricing: https://aws.amazon.com/s3/pricing/
- AWS CloudFront pricing: https://aws.amazon.com/cloudfront/pricing/
- Judge0 GitHub repository: https://github.com/judge0/judge0
\