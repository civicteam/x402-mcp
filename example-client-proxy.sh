#!/bin/bash
cd "$(dirname "$0")"
npx tsx example/proxy/client-proxy.ts --stdio
