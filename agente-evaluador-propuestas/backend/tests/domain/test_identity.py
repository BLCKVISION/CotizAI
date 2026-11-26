from datetime import UTC, datetime, timedelta

import pytest

from evaluador.domain.errors import PermissionDenied
from evaluador.domain.identity import PERMISSIONS_BY_ROLE, Permission, Role, Session, SessionPolicy, User

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
POL = SessionPolicy()


def user(role=Role.LOADER) -> User:
    return User(id="u", tenant_id="t", email="a@b.co", password_hash="h", role=role)


def session(**kw) -> Session:
    base = dict(id="s", tenant_id="t", user_id="u", token_hash="x", created=NOW,
                expires=NOW + timedelta(hours=8), last_activity=NOW)  # fmt: skip
    return Session(**{**base, **kw})


def test_all_roles_have_permissions_and_only_approver_awards():
    assert set(PERMISSIONS_BY_ROLE) == set(Role)
    con = [r for r in Role if Permission.AWARD_OR_CLOSE in PERMISSIONS_BY_ROLE[r]]
    assert con == [Role.APPROVER]


def test_only_auditor_sees_audit_and_auditor_cannot_write():
    assert [r for r in Role if user(r).has(Permission.VIEW_AUDIT)] == [Role.AUDITOR]
    assert not user(Role.AUDITOR).has(Permission.CREATE_PROJECT)


def test_require_raises_without_permission():
    with pytest.raises(PermissionDenied):
        user(Role.AUDITOR).require(Permission.CREATE_PROJECT)
    user().require(Permission.CREATE_PROJECT)


def test_lockout_after_max_failures_and_expires():
    u = user()
    for _ in range(POL.max_failed_attempts - 1):
        u = u.with_failure(NOW, POL)
        assert not u.is_blocked(NOW)
    u = u.with_failure(NOW, POL)
    assert u.is_blocked(NOW) and u.failed_attempts == 0
    assert not u.is_blocked(NOW + timedelta(minutes=POL.lockout_minutes))


def test_success_resets_counters():
    u = user().with_failure(NOW, POL).with_success()
    assert u.failed_attempts == 0 and u.blocked_until is None


def test_session_valid_expired_inactive_and_revoked():
    assert session().is_valid(NOW, POL)
    assert not session().is_valid(NOW + timedelta(hours=8), POL)
    assert not session().is_valid(NOW + timedelta(minutes=POL.inactivity_minutes), POL)
    assert not session().revoke().is_valid(NOW, POL)


def test_activity_renews_inactivity_but_not_max_lifetime():
    s = session().with_activity(NOW + timedelta(minutes=25))
    assert s.is_valid(NOW + timedelta(minutes=50), POL)
    assert not s.is_valid(NOW + timedelta(hours=8, minutes=1), POL)
