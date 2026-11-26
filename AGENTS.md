# CotizAI: instructions for people and AI agents

## Code language: English (mandatory)

All **new code** is written in English:

- Identifiers: variables, functions, classes, types, components, constants, database tables and columns.
- File and folder names.
- Comments, docstrings, test names and developer-facing log messages.
- New API routes, JSON fields, environment variables and error codes.

**Spanish stays only where a person reads the product:** UI text, accessibility labels, user-facing
error messages, reports, and the project documentation.

### Existing Spanish code
- Do not rename existing code as a side effect of another task. Migrate it in its own change, with tests.
- When calling existing Spanish code, use its current names. Do not create English duplicates or aliases.
- Public contracts (API routes and fields, stored data, `EVALUADOR_*` variables) change only in a
  planned migration that updates every consumer.
- Names fixed by the challenge statement are never translated, for example the keys of `salida.json`
  (`reto`, `repositorio`, `commit`, `inicio`, `fin`, `procesados`, `archivo`, `hora`, `ranking`).

The full coding standards are in [docs/ESTANDARES.md](docs/ESTANDARES.md).
