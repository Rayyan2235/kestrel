"""Delete one or more learners' data now, without waiting 180 days (the owner's script).

    DATABASE_URL=... python -m kestrel_analytics.forget <learner-uuid> [...]

Run from verifier/ with an admin DATABASE_URL (infra/README.md shows how to
make one for DSQL). It deletes the same rows, in the same batches, as the
nightly retention sweep.
"""

from __future__ import annotations

import os
import re
import sys

from kestrel_analytics import retention
from kestrel_verifier import db

UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def main(argv: list[str]) -> int:
    ids = [a.lower() for a in argv]
    if not ids or not all(UUID.fullmatch(i) for i in ids):
        print("usage: python -m kestrel_analytics.forget <learner-uuid> [...]", file=sys.stderr)
        return 2
    if not os.environ.get("DATABASE_URL"):
        print("forget: set DATABASE_URL to an admin connection (infra/README.md)", file=sys.stderr)
        return 2
    with db.connect() as conn:
        rows = retention.delete_learners(conn, ids)
    print(f"deleted {rows} rows for {len(ids)} learner(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
