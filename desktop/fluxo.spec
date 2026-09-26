Name: fluxo
Version: 0.5.1
Release: 1%{?dist}
Summary: Aplicação de finanças pessoais Fluxo
License: Proprietary
BuildArch: noarch
Requires: python3-gobject, gtk3, webkit2gtk4.1
Source0: fluxo.py
Source1: fluxo.desktop
Source2: fluxo.png

%description
Aplicação desktop do Fluxo para Fedora, conectada ao servidor de produção.

%prep

%build

%install
install -Dm755 %{SOURCE0} %{buildroot}%{_bindir}/fluxo
install -Dm644 %{SOURCE1} %{buildroot}%{_datadir}/applications/fluxo.desktop
install -Dm644 %{SOURCE2} %{buildroot}%{_datadir}/icons/hicolor/512x512/apps/fluxo.png

%files
%{_bindir}/fluxo
%{_datadir}/applications/fluxo.desktop
%{_datadir}/icons/hicolor/512x512/apps/fluxo.png
