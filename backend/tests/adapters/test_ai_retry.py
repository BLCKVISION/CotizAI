"""Backoff when the AI provider is busy."""

import httpx

from evaluador.adapters.outbound.ia._retry import MAX_ATTEMPTS, MAX_DELAY_SECONDS, post_with_retry


def scripted(*codes, headers=None):
    replies = iter(codes)
    return lambda: httpx.Response(next(replies), headers=headers or {})


def test_retries_until_the_provider_answers():
    waits = []
    assert post_with_retry(scripted(429, 503, 200), sleep=waits.append).status_code == 200
    assert waits == [2.0, 4.0]


def test_honours_a_bounded_retry_after():
    waits = []
    post_with_retry(scripted(429, 200, headers={"retry-after": "999"}), sleep=waits.append)
    assert waits == [MAX_DELAY_SECONDS]


def test_gives_up_and_returns_the_last_answer():
    assert post_with_retry(scripted(*[429] * MAX_ATTEMPTS), sleep=lambda _: None).status_code == 429


def test_other_errors_are_not_retried():
    waits = []
    assert post_with_retry(scripted(401), sleep=waits.append).status_code == 401
    assert waits == []


def test_a_payment_refusal_caused_by_concurrent_calls_is_retried():
    assert post_with_retry(scripted(402, 200), sleep=lambda _: None).status_code == 200
