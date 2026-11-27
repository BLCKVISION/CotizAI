# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS construccion
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /w
COPY requirements.txt .
RUN python -m venv /opt/venv && /opt/venv/bin/pip install -r requirements.txt

FROM python:3.12-slim AS ejecucion
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/app/src \
    EVALUADOR_EMBEDDINGS_CACHE=/modelos
RUN useradd --system --uid 10001 --no-create-home app && mkdir -p /modelos /datos && chown app /modelos /datos
# OCR for photos and scanned pages, with Spanish and English.
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*
COPY --from=construccion /opt/venv /opt/venv
WORKDIR /app
COPY src ./src
USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/salud').status==200 else 1)"
CMD ["uvicorn", "evaluador.adapters.inbound.http.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-access-log"]
