import threading
from dataclasses import replace
from datetime import UTC, datetime, timedelta

from evaluador.adapters.outbound.memory.jobs import InMemoryJobEvents, InMemoryJobs, InMemoryResults
from evaluador.domain.workflow import EventKind, Job, JobEvent, JobStatus

T0 = datetime(2026, 1, 1, tzinfo=UTC)


def job(id: str, tenant="t1", project="p1", minutes=0) -> Job:
    return Job(id=id, tenant_id=tenant, project_id=project, requested_by="u1", created=T0 + timedelta(minutes=minutes))


def test_claim_next_takes_the_oldest_queued_and_marks_it_running():
    jobs = InMemoryJobs()
    jobs.enqueue(job("late", minutes=5))
    jobs.enqueue(job("early", minutes=1))
    first = jobs.claim_next()
    assert first is not None and first.id == "early" and first.status is JobStatus.RUNNING
    assert jobs.by_id("t1", "early").status is JobStatus.RUNNING
    assert jobs.claim_next().id == "late"
    assert jobs.claim_next() is None


def test_claim_next_is_atomic_across_threads():
    jobs = InMemoryJobs()
    for i in range(40):
        jobs.enqueue(job(f"j{i}", minutes=i))
    taken: list[str] = []
    guard = threading.Lock()

    def worker() -> None:
        while (j := jobs.claim_next()) is not None:
            with guard:
                taken.append(j.id)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(taken) == sorted(f"j{i}" for i in range(40))  # ninguno repetido ni perdido


def test_reads_are_scoped_by_tenant():
    jobs = InMemoryJobs()
    jobs.enqueue(job("a", tenant="t1"))
    assert jobs.by_id("t2", "a") is None
    assert jobs.latest_for_project("t2", "p1") is None
    assert jobs.latest_for_project("t1", "p1").id == "a"


def test_update_replaces_and_latest_for_project_is_the_newest():
    jobs = InMemoryJobs()
    jobs.enqueue(job("old", minutes=1))
    jobs.enqueue(job("new", minutes=9))
    jobs.update(replace(jobs.by_id("t1", "old"), status=JobStatus.DONE))
    assert jobs.by_id("t1", "old").status is JobStatus.DONE
    assert jobs.latest_for_project("t1", "p1").id == "new"


def event(seq: int, job_id="j1") -> JobEvent:
    return JobEvent(job_id=job_id, seq=seq, at=T0, kind=EventKind.INFO, message=f"m{seq}")


def test_events_list_after_a_sequence_and_by_tenant():
    ev = InMemoryJobEvents()
    for s in (1, 2, 3):
        ev.append("t1", event(s))
    ev.append("t2", event(1))
    assert [e.seq for e in ev.list_after("t1", "j1")] == [1, 2, 3]
    assert [e.seq for e in ev.list_after("t1", "j1", after_seq=2)] == [3]
    assert [e.seq for e in ev.list_after("t2", "other")] == []


def test_results_are_isolated_copies_scoped_by_tenant():
    results = InMemoryResults()
    original = {"id": "j1", "ranking": ["a"]}
    results.save("t1", "j1", original)
    original["ranking"].append("x")  # mutar lo entregado no altera lo guardado
    assert results.get("t1", "j1") == {"id": "j1", "ranking": ["a"]}
    got = results.get("t1", "j1")
    got["ranking"].append("y")
    assert results.get("t1", "j1")["ranking"] == ["a"]
    assert results.get("t2", "j1") is None
