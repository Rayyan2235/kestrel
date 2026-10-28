# ADR-001: Serverless on the AWS free tier over EC2

- Status: accepted, 2026-10-28
- Supersedes: the EC2 + worker design in upscale plan rev 3

## Context

Kestrel moves from one Vultr VPS to AWS. Traffic is low and bursty: a demo, a few classes. The budget is the AWS free tier plus about $100 of credits. Users are minors, so the less infrastructure that holds data, the better.

An always-on EC2 instance bills every hour, idle or not. A NAT gateway (~$32/month) or a load balancer (~$16/month) would use most of the budget on their own.

## Decision

Build on pay-per-request services: Lambda for the API and the jobs, SQS for slow work, S3 and CloudFront for the web app, and Aurora DSQL for the database. Use no EC2, NAT gateway or load balancer. The exact service list follows plan rev 4.

## Consequences

- Idle costs nothing, and scaling is AWS's job.
- The schema must be DSQL-compatible from the start ([ADR-002](ADR-002-dsql-compatible-schema.md)).
- Lambda limits shape the code:
  - The request body limit is 6 MB, so voice uploads go straight to S3 with a presigned URL.
  - Cold starts add latency to the first request.
  - Native Python wheels (MuJoCo, onnxruntime) need a container-image Lambda.
- Local development does not need AWS: `docker compose` runs Postgres and ElasticMQ, an SQS stand-in.
