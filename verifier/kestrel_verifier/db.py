"""The database connection for the Python Lambdas (the verifier and the nightly analytics job).

Locally and in CI: DATABASE_URL. On AWS: Aurora DSQL with a short-lived IAM
token signed by the Lambda role (dsql:DbConnect), as a non-admin role:
kestrel_verifier by default, kestrel_analytics for the analytics job
(infra/README.md). A token is signed per connection.
"""

from __future__ import annotations

import os

import psycopg

DSQL_USER = "kestrel_verifier"


def connect(user: str = DSQL_USER) -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if url:
        return psycopg.connect(url, autocommit=True)
    host = os.environ["DSQL_ENDPOINT"]
    import boto3  # in the Lambda image; only needed on AWS

    region = os.environ.get("AWS_REGION", "us-east-1")
    token = boto3.client("dsql", region_name=region).generate_db_connect_auth_token(Hostname=host, Region=region)
    return psycopg.connect(host=host, port=5432, dbname="postgres", user=user, password=token, sslmode="require", autocommit=True)
