#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rpm_root="$repo_root/desktop/.rpmbuild"
mkdir -p "$rpm_root"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
cp "$repo_root/desktop/fluxo.py" "$rpm_root/SOURCES/fluxo.py"
cp "$repo_root/desktop/fluxo.desktop" "$rpm_root/SOURCES/fluxo.desktop"
cp "$repo_root/public/icons/icone-512.png" "$rpm_root/SOURCES/fluxo.png"
cp "$repo_root/desktop/fluxo.spec" "$rpm_root/SPECS/fluxo.spec"
rpmbuild -bb "$rpm_root/SPECS/fluxo.spec" --define "_topdir $rpm_root"
find "$rpm_root/RPMS" -type f -name '*.rpm' -print
mkdir -p "$repo_root/builds"
cp "$rpm_root/RPMS/noarch/fluxo-0.5.1-1.fc44.noarch.rpm" "$repo_root/builds/Fluxo-Fedora-0.5.1.fc44.noarch.rpm"
echo "$repo_root/builds/Fluxo-Fedora-0.5.1.fc44.noarch.rpm"
