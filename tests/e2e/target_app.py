import os, sys, gi
gi.require_version('Gtk', '4.0')
from gi.repository import Gtk
OUT = os.environ["TH_OUT"]
def on_activate(app):
    win = Gtk.ApplicationWindow(application=app, title='Editor de teste', default_width=700, default_height=420)
    view = Gtk.TextView(wrap_mode=Gtk.WrapMode.WORD, left_margin=16, top_margin=16)
    buf = view.get_buffer()
    def changed(b):
        with open(os.path.join(OUT, 'pasted.txt'), 'w') as f:
            f.write(b.get_text(b.get_start_iter(), b.get_end_iter(), False))
    buf.connect('changed', changed)
    win.set_child(view)
    win.present()
    view.grab_focus()
app = Gtk.Application(application_id='local.th.Target')
app.connect('activate', on_activate)
app.run([])
