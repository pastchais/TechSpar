#!/usr/bin/env bash
set -euo pipefail

# Debian docker-compose v1 can break when /usr/local Python packages override
# distro-managed requests/docker libraries. Run it in an isolated interpreter
# path and clear Docker/Compose env overrides that commonly poison the client.
export PYTHONPATH=/usr/lib/python3/dist-packages
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH COMPOSE_FILE COMPOSE_PROJECT_NAME

exec python3 -S /usr/bin/docker-compose "$@"
