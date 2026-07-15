FROM python:3.13-slim

WORKDIR /workspace
RUN useradd --create-home --uid 10001 jejak

COPY apps/risk-service/requirements.txt apps/risk-service/requirements.txt
RUN pip install --no-cache-dir -r apps/risk-service/requirements.txt

COPY apps/risk-service apps/risk-service
COPY packages/domain packages/domain

ENV PYTHONPATH=/workspace/apps/risk-service/src:/workspace
USER jejak
CMD ["python", "-m", "uvicorn", "risk_service.app:app", "--host", "0.0.0.0", "--port", "8001"]
