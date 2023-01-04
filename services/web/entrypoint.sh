#!/bin/sh

export FLASK_APP=project/__init__.py

#python manage.py create_db

if [ ! -z "$@" ]; then
  exec "$@"
else
  python manage.py run -h 0.0.0.0
fi