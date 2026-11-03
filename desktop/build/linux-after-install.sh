#!/bin/bash
# .deb post-install: the same as electron-builder's template (link on the PATH, Chromium sandbox,
# menus) plus a udev rule that gives the logged-in user access to USB CNC controllers, without
# needing the dialout group. Chips used by CNC controllers (STM32 on the
# SuperLongBoard/SLB-EXT/SLB-LITE, CH340 and Arduino on the LongBoard, FTDI, CP210x, Teensy, RP2040...).
APP=/opt/CarvCAM/carvcam

if type update-alternatives >/dev/null 2>&1; then
  if [ -L /usr/bin/carvcam ] && [ -e /usr/bin/carvcam ] && [ "$(readlink /usr/bin/carvcam)" != /etc/alternatives/carvcam ]; then
    rm -f /usr/bin/carvcam
  fi
  update-alternatives --install /usr/bin/carvcam carvcam "$APP" 100 || ln -sf "$APP" /usr/bin/carvcam
else
  ln -sf "$APP" /usr/bin/carvcam
fi

if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
  chmod 4755 /opt/CarvCAM/chrome-sandbox || true
else
  chmod 0755 /opt/CarvCAM/chrome-sandbox || true
fi

hash update-mime-database 2>/dev/null && update-mime-database /usr/share/mime || true
hash update-desktop-database 2>/dev/null && update-desktop-database /usr/share/applications || true

mkdir -p /etc/udev/rules.d
cat > /etc/udev/rules.d/60-carvcam.rules <<'RULES'
# CarvCAM: USB CNC controllers accessible to the logged-in user
SUBSYSTEM=="tty", ATTRS{idVendor}=="0483", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="2341", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="16c0", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="2e8a", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="1d50", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="067b", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="03eb", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="16d0", TAG+="uaccess"
RULES
udevadm control --reload-rules 2>/dev/null || true
udevadm trigger --subsystem-match=tty 2>/dev/null || true
exit 0
