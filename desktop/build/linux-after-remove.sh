#!/bin/bash
if type update-alternatives >/dev/null 2>&1; then
  update-alternatives --remove carvcam /usr/bin/carvcam
else
  rm -f /usr/bin/carvcam
fi
rm -f /etc/udev/rules.d/60-carvcam.rules
udevadm control --reload-rules 2>/dev/null || true
exit 0
