from evaluador.application.use_cases.evaluation_lookup import RepositoryEvaluationLookup


class Jobs:
    def by_id(self, tenant_id, job_id):
        return object() if (tenant_id, job_id) in {("t1", "j1"), ("t1", "j2")} else None


class Results:
    def get(self, tenant_id, job_id):
        return {"proposals": [{"id": "A"}, {"id": "B"}]} if (tenant_id, job_id) == ("t1", "j1") else None


def test_lookup_uses_jobs_for_existence_and_results_for_proposals():
    lk = RepositoryEvaluationLookup(Jobs(), Results())
    assert lk.exists("t1", "j1") and not lk.exists("t2", "j1")
    assert lk.proposal_ids("t1", "j1") == {"A", "B"}
    assert lk.proposal_ids("t1", "j2") == set()  # existe pero aún sin resultado
    assert lk.proposal_ids("t2", "j1") is None  # otro tenant: no existe
