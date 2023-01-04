#!/bin/sh

export FLASK_APP=project/__init__.py

if [ ! -z "$@" ]; then
  exec "$@"
else
  gunicorn --bind 0.0.0.0:5000 manage:app
fi
