#!/bin/sh

export FLASK_APP=project/__init__.py

exec "${@:-gunicorn --bind 0.0.0.0:5000 manage:app}"
