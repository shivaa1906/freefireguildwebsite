#!/bin/sh
set -eu

npm run stop
nohup npm run api > api.log 2>&1 < /dev/null &
nohup npm run dev -- --port 5173 > vite.log 2>&1 < /dev/null &
printf '%s\n' 'API and Vite started in background.' 'API log: api.log' 'Vite log: vite.log'
