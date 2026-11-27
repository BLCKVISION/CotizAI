"""Punto de entrada `python -m evaluador.worker` (la lógica vive en adapters/inbound/worker)."""

from evaluador.adapters.inbound.worker import main

if __name__ == "__main__":
    raise SystemExit(main())
