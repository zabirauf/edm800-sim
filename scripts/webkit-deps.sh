#!/usr/bin/env bash
# Make Playwright's WebKit (Safari engine) run on Ubuntu 22.04 without root.
#
# `npx playwright install-deps webkit` needs sudo. This downloads the five missing libraries into
# ~/.cache/pw-webkit-deps (apt-get download + dpkg -x, no root) and writes a launcher that adds them to
# LD_LIBRARY_PATH. playwright.config.mjs uses the launcher automatically when it exists.
# Not needed on macOS, or on Linux where `sudo npx playwright install-deps webkit` works.
set -euo pipefail
DEST="$HOME/.cache/pw-webkit-deps"
WK=$(ls -d "$HOME"/.cache/ms-playwright/webkit-* 2>/dev/null | sort -V | tail -1)
[[ -d "$WK/minibrowser-wpe" ]] || { echo "Playwright WebKit not found — run: npx playwright install webkit" >&2; exit 1; }
mkdir -p "$DEST/debs"
cd "$DEST/debs"
apt-get download libevent-2.1-7 libgstreamer-plugins-bad1.0-0 libavif13 libgav1-0 libyuv0
for d in *.deb; do dpkg -x "$d" "$DEST/root"; done
cat > "$DEST/MiniBrowser" <<WRAP
#!/bin/sh
D="$WK/minibrowser-wpe"
export WEBKIT_EXEC_PATH="\$D/bin" WEBKIT_INJECTED_BUNDLE_PATH="\$D/lib" WEBKIT_INSPECTOR_RESOURCES_PATH="\$D/share"
export LD_LIBRARY_PATH="\$D/lib:\$D/sys/lib:$DEST/root/usr/lib/x86_64-linux-gnu"
export WEBKIT_FORCE_COMPLEX_TEXT=1
exec "\$D/bin/MiniBrowser" "\$@"
WRAP
chmod +x "$DEST/MiniBrowser"
echo "WebKit launcher: $DEST/MiniBrowser"
