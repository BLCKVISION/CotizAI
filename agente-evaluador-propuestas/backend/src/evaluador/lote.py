"""Punto de entrada `python -m evaluador.lote` (la lógica vive en adapters/inbound/cli)."""

from evaluador.adapters.inbound.cli.batch import main

if __name__ == "__main__":
    raise SystemExit(main())
