#!/usr/bin/env bash
# Mac: double-clicking this file opens Terminal and runs CarvCAM (same as try-carvcam.sh).
cd "$(dirname "$0")"
bash ./try-carvcam.sh "$@"
status=$?
if [ $status -ne 0 ]; then
  echo
  echo "Something went wrong (code $status). Copy the messages above and send them to whoever is helping you."
fi
read -r -p "Press Enter to close…" _
