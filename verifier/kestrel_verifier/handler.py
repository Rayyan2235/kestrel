"""Lambda entry: SQS messages in, verdicts and XP out.

Each message is a claim check, {"attemptId", "s3Key"}: the claim itself (the
learner, and where the weights ended up or a walking objective's pose log) is
in the data bucket under replays/.
A message that fails is reported in batchItemFailures, so only it is retried;
after 3 receives SQS moves it to the dead-letter queue. A malformed message
(a poison message) fails every time and ends up there too. A business
rejection (lock after trial start, wrong marks) is a verdict, not a failure.
Logs carry ids and outcomes, never the claim body.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from kestrel_verifier import db, moments, store
from kestrel_verifier.rules import Claim

UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
_conn = None
_s3 = None


def parse_message(body: str) -> tuple[str, str]:
    msg = json.loads(body)
    attempt_id, key = msg["attemptId"], msg["s3Key"]
    if not re.fullmatch(UUID, attempt_id) or key != f"replays/{attempt_id}.json":
        raise ValueError("malformed verify message")
    return attempt_id, key


def parse_claim(attempt_id: str, raw: bytes) -> Claim:
    c = json.loads(raw)
    if "trajectory" in c:
        # A walking objective: the pose log, and the rescue route if any. walking.py checks their contents.
        route = c.get("route")
        if not isinstance(c["trajectory"], dict) or not (route is None or (isinstance(route, list) and all(isinstance(b, str) for b in route))):
            raise ValueError("malformed walking claim")
        claim = Claim(c["attemptId"], c["learnerId"], trajectory=c["trajectory"], route=route)
    else:
        claim = Claim(c["attemptId"], c["learnerId"], float(c["leftCm"]), float(c["rightCm"]))
    if claim.attempt_id != attempt_id or not re.fullmatch(UUID, claim.learner_id):
        raise ValueError("malformed claim")
    return claim


def read_claim(key: str) -> bytes:
    global _s3
    if _s3 is None:
        import boto3

        _s3 = boto3.client("s3")
    return _s3.get_object(Bucket=os.environ["DATA_BUCKET"], Key=key)["Body"].read()


def connection():
    global _conn
    # A broken connection (dropped, or a DSQL connection past its 1 h limit) is reopened.
    if _conn is None or _conn.closed or _conn.broken:
        _conn = db.connect()
    return _conn


def process(body: str) -> None:
    attempt_id, key = parse_message(body)
    claim = parse_claim(attempt_id, read_claim(key))
    verdict = store.verify(connection(), claim, moments.resim)
    outcome = "already decided" if verdict is None else f"{verdict.status}: {verdict.reason}, {len(verdict.awards)} award(s)"
    print(json.dumps({"attemptId": attempt_id, "outcome": outcome}))


def handler(event: dict[str, Any], _context: Any) -> dict[str, list[dict[str, str]]]:
    failures = []
    for record in event.get("Records", []):
        try:
            process(record["body"])
        except Exception as error:  # noqa: BLE001 - every failure is reported, then retried or dead-lettered
            print(json.dumps({"messageId": record.get("messageId"), "error": type(error).__name__}))
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}
