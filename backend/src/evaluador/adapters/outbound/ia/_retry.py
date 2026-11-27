"""Retries a model call that the provider rejected for being too busy (429) or temporarily failing (5xx).

402 is retried too: with little or no purchased credit, a provider refuses calls only while others are in flight.
An account that is really out of credit still fails, after the attempts.
"""

from __future__ import annotations

import time
from collections.abc import Callable

import httpx

RETRYABLE = frozenset({402, 429, 500, 502, 503, 504})
MAX_ATTEMPTS = 5
BASE_DELAY_SECONDS = 2.0
MAX_DELAY_SECONDS = 20.0


def delay_for(response: httpx.Response, attempt: int) -> float:
    """The provider's Retry-After when present, otherwise exponential backoff; always bounded."""
    try:
        wait = float(response.headers.get("retry-after", ""))
    except ValueError:
        wait = BASE_DELAY_SECONDS * 2 ** (attempt - 1)
    return min(max(wait, 0.0), MAX_DELAY_SECONDS)


def post_with_retry(
    send: Callable[[], httpx.Response], *, sleep: Callable[[float], None] = time.sleep
) -> httpx.Response:
    for attempt in range(1, MAX_ATTEMPTS):
        response = send()
        if response.status_code not in RETRYABLE:
            return response
        sleep(delay_for(response, attempt))
    return send()
