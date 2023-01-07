#!/bin/sh

#python manage.py create_db

if [ ! -z "$@" ]; then
  exec "$@"
else
  python manage.py run -h 0.0.0.0
fi