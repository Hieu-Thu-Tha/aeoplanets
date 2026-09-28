#!/bin/bash
set -e
rm -rf node_modules/@radix-ui/.react-*-* 2>/dev/null || true
npm install --prefer-offline 2>/dev/null || npm install
npm run db:push
