#!/usr/bin/env bash
set -euo pipefail

mastik_dir="../vendor/Mastik"

if [ ! -f "$mastik_dir/src/libmastik.a" ]; then
  (
    cd "$mastik_dir"
    ./configure --disable-symbols --disable-doubloon
    make -j"$(nproc)"
  )
fi

make app bob mallory eve
