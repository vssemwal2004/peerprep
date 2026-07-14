# PeerPrep Scaling Cost Report: AWS vs Own Server

Date: 2026-07-03

## 1. Goal

PeerPrep ko 500 students ke liye scale karna hai. Current plan me two major workloads hain:

1. Code execution / judging using Judge0.
2. Video delivery for course/learning content.

This report compares two approaches:

1. AWS services use karna.
2. Own Ubuntu server machine use karna.

Existing own server specification:

```txt
CPU: Intel i9, 8 cores
RAM: 32 GB
Storage: 2 TB
OS: Ubuntu
Target users: 500 students
```

## 2. Important Assumptions

Costing exact nahi hoti jab tak real usage numbers fixed na hon. Is report me planning estimates use kiye gaye hain.

Assumptions:

```txt
AWS Region: us-east-1 or closest low-cost region
Currency: USD, with rough INR conversion at 1 USD = INR 85
Judge0 traffic: 500 students, normal learning usage
Peak submission spike: 100-500 submissions within short window
Video quality: 720p/1080p streaming
AWS pricing model: On-Demand, no long-term commitment
```

Note: AWS pricing region, traffic, taxes, support plan, and discounts ke according change hoti hai. Final production decision se pehle AWS Pricing Calculator me exact estimate banana chahiye.

## 3. Technical Requirement Summary

### 3.1 Judge0 Requirement

Judge0 ke liye required components:

```txt
Judge0 API server
Judge0 workers
PostgreSQL
Redis
Docker
Reverse proxy: Nginx/Caddy/ALB
SSL certificate
Monitoring
Backups
Rate limiting and API authentication
```

500 students ke liye Judge0 workload manageable hai, agar sab students exact same time par heavy submissions nahi kar rahe.

Recommended Judge0 limits:

```txt
Workers: 8-10 on own server
CPU time limit: 3-5 seconds
Wall time limit: 10-15 seconds
Memory limit: 128-256 MB
Queue size: 500+
Output size limit: strict
Network access inside submissions: disabled
```

### 3.2 Video Requirement

Video ka bottleneck CPU nahi, mostly bandwidth hai.

Approx streaming bandwidth:

```txt
720p video: 2-3 Mbps per active viewer
1080p video: 4-5 Mbps per active viewer
```

If 500 students watch at same time:

```txt
720p: 500 * 2.5 Mbps = 1.25 Gbps upload
1080p: 500 * 5 Mbps = 2.5 Gbps upload
```

This means own server se direct video streaming karna practical nahi hoga unless you have 1-3 Gbps stable upload, public static IP, CDN, power backup, and monitoring.

## 4. Option A: AWS Based Setup

### 4.1 Recommended AWS Architecture

Minimum practical AWS setup:

```txt
Users
  -> CloudFront
  -> Application Load Balancer / Nginx
  -> EC2 instance(s) running app + Judge0 API/workers
  -> PostgreSQL: RDS or self-hosted Postgres
  -> Redis: ElastiCache or self-hosted Redis
  -> S3 for videos/assets/backups
  -> CloudWatch for logs/metrics
```

For videos:

```txt
Videos stored in S3
Videos delivered through CloudFront CDN
Optional transcoding: AWS MediaConvert or external encoder
```

### 4.2 AWS Lean Setup

This is good for early production, low cost, and manageable traffic.

```txt
EC2: 1 compute instance for app + Judge0
Database: PostgreSQL on same EC2 or small RDS
Redis: same EC2 or small ElastiCache
Storage: EBS gp3
Videos: YouTube or external CDN, not AWS-hosted initially
Monitoring: CloudWatch basic + Uptime Kuma
```

Estimated monthly cost:

| Item | Estimate USD/month | Estimate INR/month |
|---|---:|---:|
| EC2 compute | 120-260 | 10,200-22,100 |
| EBS storage 200-500 GB | 16-40 | 1,360-3,400 |
| Public IPv4 / misc | 4-10 | 340-850 |
| Backups/snapshots | 5-25 | 425-2,125 |
| Monitoring/logs | 5-30 | 425-2,550 |
| Total without AWS video hosting | 150-365 | 12,750-31,025 |

Good for:

```txt
Judge0 self-hosted on AWS
Low to medium traffic
MVP / early paid users
Simple operations
```

Risk:

```txt
Single EC2 failure can affect service
Database on same EC2 is cheaper but less reliable
Scaling needs manual work
```

### 4.3 AWS Balanced Setup

This is better for production reliability.

```txt
EC2: 1-2 compute instances for app/Judge0 workers
RDS PostgreSQL: managed database
ElastiCache Redis: managed Redis, optional
ALB: load balancer
S3: storage for backups and assets
CloudFront: CDN for static/video content
CloudWatch: monitoring/logging
```

Estimated monthly cost:

| Item | Estimate USD/month | Estimate INR/month |
|---|---:|---:|
| EC2 Judge0/app compute | 250-600 | 21,250-51,000 |
| RDS PostgreSQL | 50-180 | 4,250-15,300 |
| Redis / ElastiCache or self-hosted | 0-80 | 0-6,800 |
| EBS storage | 30-100 | 2,550-8,500 |
| ALB | 20-35 | 1,700-2,975 |
| Backups/snapshots | 20-80 | 1,700-6,800 |
| Logs/monitoring | 20-100 | 1,700-8,500 |
| Total without heavy video delivery | 390-1,175 | 33,150-99,875 |

Good for:

```txt
More reliable production
Easier backups
Better monitoring
Managed database
Future scaling
```

Risk:

```txt
Cost increases quickly
Video bandwidth can dominate bill
Needs AWS knowledge
```

### 4.4 AWS Video Hosting Cost

Video is the expensive part if hosted on AWS.

Storage estimate:

```txt
1 hour 1080p video: approx 1.8-3 GB
Adaptive HLS renditions: approx 3-5 GB per hour
500 hours adaptive video: approx 1.5-2.5 TB
```

Approx AWS storage cost:

```txt
S3 Standard 2 TB: around 45-60 USD/month
```

Bandwidth estimate:

```txt
If 500 students watch 20 hours/month each:
500 * 20 hours = 10,000 viewer-hours/month

At 720p approx 1.1 GB/hour:
10,000 * 1.1 GB = 11 TB/month

At 1080p approx 2.25 GB/hour:
10,000 * 2.25 GB = 22.5 TB/month
```

CloudFront transfer can become significant. AWS now also offers CloudFront flat-rate plans where, as of the referenced pricing page, the Pro plan is listed at 15 USD/month with 50 TB data transfer allowance, and Business at 200 USD/month with 50 TB allowance. Confirm eligibility/features before depending on this for production video delivery.

Estimated AWS video monthly cost:

| Scenario | Estimate USD/month | Estimate INR/month |
|---|---:|---:|
| Low video usage | 50-150 | 4,250-12,750 |
| 10-20 TB/month delivery | 150-800 | 12,750-68,000 |
| Heavy 1080p usage | 800+ | 68,000+ |

Recommendation: For early stage, do not host videos directly on EC2. Use YouTube unlisted/private, Bunny Stream, Mux, Cloudflare Stream, or S3 + CloudFront only after exact usage calculation.

## 5. Option B: Own Server Setup

### 5.1 Recommended Own Server Architecture

```txt
Users
  -> Cloudflare DNS / Tunnel / Public static IP
  -> Caddy or Nginx reverse proxy
  -> PeerPrep backend/frontend
  -> Judge0 Docker stack
  -> PostgreSQL
  -> Redis
  -> Monitoring
  -> Backup storage
```

Services on own machine:

```txt
Ubuntu Server 24.04 LTS
Docker + Docker Compose
Judge0 CE
PostgreSQL
Redis
Caddy or Nginx
UFW firewall
Fail2ban
Uptime Kuma
Netdata or Prometheus/Grafana
Restic/Borg backups
Cloudflare Tunnel or static IP
```

### 5.2 Own Server One-Time Cost

If machine already exists, one-time hardware cost is mostly zero.

Possible extra one-time costs:

| Item | Estimate INR |
|---|---:|
| UPS / power backup | 8,000-25,000 |
| Better cooling / cabinet / fans | 2,000-10,000 |
| Extra SSD/NVMe for OS/database | 4,000-12,000 |
| External backup drive | 5,000-15,000 |
| Router/static IP setup | 0-5,000 |

### 5.3 Own Server Monthly Cost

Estimated monthly cost:

| Item | Estimate INR/month |
|---|---:|
| Electricity | 1,000-3,500 |
| Internet plan | 1,000-5,000 |
| Static IP, if available | 200-1,000 |
| Domain | 80-150 |
| Cloudflare basic DNS/CDN | 0 |
| Backup storage/cloud backup | 300-2,000 |
| Monitoring tools | 0 |
| Total | 2,580-11,650 |

If you already have internet and power, incremental cost can be very low.

### 5.4 Is Existing Server Enough?

For Judge0:

```txt
8 cores: enough for starting
32 GB RAM: enough
2 TB storage: more than enough for Judge0
```

Recommended starting config:

```txt
Judge0 workers: 8
Max queue size: 500
CPU time limit: 3-5 sec
Memory limit: 128-256 MB
Rate limit per user/IP
Daily log cleanup
Daily DB backup
```

Expected performance:

```txt
Normal learning usage: good
Small contests: okay
Large simultaneous contests: queue delay possible
```

For videos:

```txt
Storage: okay for many videos
Upload bandwidth: likely not enough
Reliability: risky
```

Own server should not directly stream all videos to 500 students unless you have enterprise-grade upload bandwidth and CDN.

## 6. AWS vs Own Server Comparison

| Area | AWS | Own Server |
|---|---|---|
| Monthly cost | Higher | Lower |
| Setup complexity | Medium | Medium-high |
| Reliability | Better | Depends on power/internet |
| Scaling | Easier | Harder |
| Security responsibility | Shared with AWS | Mostly yours |
| Judge0 suitability | Very good | Good |
| Video suitability | Good with CDN | Poor without CDN |
| Backups | Easier | Must build yourself |
| Monitoring | Built-in options | Must set up |
| Public access | Easy | Static IP/Tunnel needed |

## 7. Main Challenges

### 7.1 Security

Judge0 runs user code, so it must be treated as high-risk infrastructure.

Required controls:

```txt
API token/authentication
Rate limiting
Firewall
No direct database exposure
No public Redis/PostgreSQL
Submission network disabled
Strict CPU/memory/output limits
Regular OS and Docker updates
```

### 7.2 Reliability

Own server reliability needs:

```txt
UPS
Auto-start after power failure
Docker restart policies
Health checks
Monitoring alerts
Daily backups
Internet failover if possible
```

### 7.3 Scaling

When load grows:

```txt
Step 1: Increase Judge0 workers on same machine
Step 2: Move app/backend away from Judge0 machine
Step 3: Add separate Judge0 worker machines
Step 4: Move PostgreSQL/Redis to managed or separate server
Step 5: Use CDN for videos/static assets
```

### 7.4 Video Bandwidth

Video should use CDN or video platform. Direct server streaming is the biggest risk.

Better choices:

```txt
YouTube API: cheapest and easiest
Bunny Stream: low-cost video CDN
Mux: developer-friendly but can cost more
Cloudflare Stream: simple managed video hosting
S3 + CloudFront: flexible AWS-native option
```

## 8. Recommended Roadmap

### Phase 1: Lowest Cost, Practical

```txt
Judge0: own server
Videos: YouTube API or video CDN
Backend/frontend: existing hosting
Monitoring: Uptime Kuma + Netdata
Backup: daily PostgreSQL dump to cloud/external drive
```

Estimated monthly cost:

```txt
INR 2,500-12,000 depending on internet/power/static IP
```

### Phase 2: Production Hardening

```txt
Add domain and SSL
Add Cloudflare Tunnel or static IP
Add strict firewall
Add alerts
Add automated backups
Run load test for 500 students
```

### Phase 3: Hybrid Cloud

```txt
Judge0 workers: own server
Database/backups: AWS or managed provider
Videos: CDN/video platform
App: AWS/Vercel/Render/own server depending on traffic
```

Estimated monthly cost:

```txt
INR 8,000-35,000
```

### Phase 4: Full AWS

```txt
EC2/ECS for Judge0
RDS PostgreSQL
ElastiCache Redis
S3 + CloudFront for assets/videos
CloudWatch monitoring
ALB
Auto Scaling where possible
```

Estimated monthly cost:

```txt
Without heavy video: INR 33,000-1,00,000/month
With heavy video: can go above INR 1,00,000/month
```

## 9. Final Recommendation

Best balanced plan:

```txt
Use own server for Judge0.
Do not self-host videos directly from own machine.
Keep videos on YouTube or use a dedicated video CDN.
Use Cloudflare for DNS/security/tunnel.
Add monitoring, backups, rate limits, and load testing before launch.
```

Reason:

```txt
Judge0 needs CPU and RAM. Your machine has enough.
Video needs bandwidth and CDN. Your machine is not ideal for that.
AWS is reliable but monthly cost can become high, especially with video delivery.
Hybrid approach gives best cost-control and practical reliability.
```

## 10. Reference Links

AWS pricing and service references:

- Amazon EC2 On-Demand Pricing: https://aws.amazon.com/ec2/pricing/on-demand/
- Amazon EBS Pricing: https://aws.amazon.com/ebs/pricing/
- Amazon RDS for PostgreSQL Pricing: https://aws.amazon.com/rds/postgresql/pricing/
- Amazon S3 Pricing: https://aws.amazon.com/s3/pricing/
- Amazon CloudFront Pricing: https://aws.amazon.com/cloudfront/pricing/
- Amazon VPC Pricing: https://aws.amazon.com/vpc/pricing/

Judge0 references:

- Judge0 GitHub repository: https://github.com/judge0/judge0
- Judge0 Docker Compose: https://github.com/judge0/judge0/blob/master/docker-compose.yml

