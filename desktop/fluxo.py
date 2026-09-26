#!/usr/bin/python3
"""Janela Fedora do Fluxo, ligada à mesma aplicação web de produção."""

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import Gtk, WebKit2  # noqa: E402

APP_URL = "https://fluxo-pessoal.cloudfapp.workers.dev/"


class Fluxo(Gtk.Application):
    def __init__(self):
        super().__init__(application_id="dev.cloudfapp.fluxo")

    def do_activate(self):
        window = Gtk.ApplicationWindow(application=self)
        window.set_title("Fluxo")
        window.set_default_size(1280, 820)
        window.set_size_request(360, 500)

        view = WebKit2.WebView()
        view.get_settings().set_enable_javascript(True)
        view.get_settings().set_enable_write_console_messages_to_stdout(False)
        view.load_uri(APP_URL)
        window.add(view)
        window.show_all()


if __name__ == "__main__":
    Fluxo().run()
