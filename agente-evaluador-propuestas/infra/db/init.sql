-- Se ejecuta una sola vez al crear el volumen. Las migraciones posteriores van en Alembic.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS fragmentos (
    id            uuid PRIMARY KEY,
    tenant_id     text        NOT NULL,
    propuesta_id  text        NOT NULL,
    orden         integer     NOT NULL,
    contenido     text        NOT NULL,
    embedding     vector(384) NOT NULL,   -- paraphrase-multilingual-MiniLM-L12-v2
    creado        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fragmentos_tenant_propuesta_idx ON fragmentos (tenant_id, propuesta_id);
CREATE INDEX IF NOT EXISTS fragmentos_embedding_hnsw_idx ON fragmentos USING hnsw (embedding vector_cosine_ops);
