"""A small in-memory sliding-window rate limiter.

State lives in this process, so with several workers each one counts separately
(the effective limit is multiplied by the worker count). That is enough to stop
password guessing and runaway LLM spend on a single instance. Behind a load
balancer, swap this for a shared store such as Redis.
"""
import math
import time
from collections import deque

from app.core.exceptions import TooManyRequestsError

# Forget idle keys now and then so memory stays bounded.
_SWEEP_EVERY = 1000


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._calls = 0

    def hit(self, key: str, *, limit: int, window_seconds: int) -> None:
        """Record a request for `key`, or raise TooManyRequestsError if it's over the limit."""
        now = time.monotonic()
        self._calls += 1
        if self._calls % _SWEEP_EVERY == 0:
            self._sweep(now)

        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= now - window_seconds:
            hits.popleft()
        if len(hits) >= limit:
            retry_after = max(1, math.ceil(hits[0] + window_seconds - now))
            raise TooManyRequestsError("Too many requests. Please wait and try again.", retry_after)
        hits.append(now)

    def reset(self) -> None:
        self._hits.clear()

    def _sweep(self, now: float, max_window_seconds: int = 3600) -> None:
        stale = [k for k, hits in self._hits.items() if not hits or hits[-1] <= now - max_window_seconds]
        for key in stale:
            del self._hits[key]


limiter = RateLimiter()
