#!/usr/bin/env sh
set -eu
python3 -m py_compile "$(dirname "$0")/list_projects.py"
echo "OK python-list-projects-syntax"
