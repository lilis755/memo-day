#!/bin/zsh
cd "$(dirname "$0")"

if ! lsof -ti:4173 >/dev/null 2>&1; then
  node server.js >/tmp/memo-day.log 2>&1 &
  sleep 1
fi

open "http://localhost:4173/index.html"
