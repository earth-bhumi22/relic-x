"""In-memory token-bucket rate limiter (T22).

One bucket per (client, key). A bucket holds up to ``capacity`` tokens and
refills continuously at ``capacity`` tokens per ``period`` seconds; each request
takes one token. With no token left the request gets 429 and a ``Retry-After``
header saying how long until the next token. O(1) per request.

Per process only: with several API replicas, use a shared store (e.g. Redis).
Behind a reverse proxy every request comes from the proxy's address, so the
limit applies to all clients together (see SECURITY.md).
"""

from __future__ import annotations

import math
import threading
import time

from .errors import DomainError


class RateLimited(DomainError):
    code = "rate_limited"
    status = 429


class TokenBucket:
    def __init__(self, capacity: int, period: float = 60.0, clock=time.monotonic) -> None:
        self.capacity = capacity
        self.rate = capacity / period  # tokens per second
        self.clock = clock
        self._buckets: dict[str, tuple[float, float]] = {}  # key -> (tokens, last refill time)
        self._lock = threading.Lock()

    def take(self, key: str) -> None:
        """Consume one token or raise RateLimited (with retry_after in details)."""
        with self._lock:
            now = self.clock()
            tokens, last = self._buckets.get(key, (float(self.capacity), now))
            tokens = min(self.capacity, tokens + (now - last) * self.rate)
            if tokens < 1.0:
                wait = math.ceil((1.0 - tokens) / self.rate)
                self._buckets[key] = (tokens, now)
                raise RateLimited(
                    f"too many requests: at most {self.capacity} per minute; retry in {wait} s",
                    details={"retry_after": wait},
                )
            self._buckets[key] = (tokens - 1.0, now)
