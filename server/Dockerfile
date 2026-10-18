FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_DATA_DIR=/data \
    DJANGO_SHARED_DIR=/app/shared

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
COPY --from=shared . /app/shared
RUN DJANGO_SECRET_KEY=build uv run --no-dev python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["sh", "-c", "uv run --no-dev python manage.py migrate --noinput && exec uv run --no-dev gunicorn config.wsgi --bind 0.0.0.0:8000"]
