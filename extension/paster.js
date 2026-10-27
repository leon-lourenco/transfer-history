// Devolve um item à área de transferência e cola na janela focada com um teclado virtual (ADR-0003).
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {ItemType} from './historyStore.js';

// Espera o foco voltar para a janela depois que o popup solta o grab.
const PASTE_DELAY_MS = 120;

// Terminais colam com Ctrl+Shift+V.
const TERMINAL_WM_CLASSES = [
    'gnome-terminal', 'org.gnome.terminal', 'org.gnome.ptyxis', 'ptyxis', 'kgx', 'org.gnome.console',
    'kitty', 'alacritty', 'org.wezfurlong.wezterm', 'foot', 'com.mitchellh.ghostty', 'tilix',
    'konsole', 'xterm', 'terminator', 'blackbox', 'com.raggesilver.blackbox',
];

export class Paster {
    constructor({store}) {
        this._store = store;
        this._clipboard = St.Clipboard.get_default();
        const seat = Clutter.get_default_backend().get_default_seat();
        this._keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        this._timeoutId = 0;
    }

    copy(item) {
        if (item.type === ItemType.TEXT)
            this._clipboard.set_text(St.ClipboardType.CLIPBOARD, item.text);
        else
            this._clipboard.set_content(St.ClipboardType.CLIPBOARD, 'image/png', this._store.loadImage(item));
    }

    copyAndPaste(item) {
        this.copy(item);
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PASTE_DELAY_MS, () => {
            this._timeoutId = 0;
            this._sendPasteShortcut();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
        this._keyboard = null;
    }

    _sendPasteShortcut() {
        const wmClass = global.display.focus_window?.get_wm_class()?.toLowerCase() ?? '';
        const keys = [Clutter.KEY_Control_L];
        if (TERMINAL_WM_CLASSES.includes(wmClass))
            keys.push(Clutter.KEY_Shift_L);
        keys.push(Clutter.KEY_v);

        const time = GLib.get_monotonic_time();
        for (const key of keys)
            this._keyboard.notify_keyval(time, key, Clutter.KeyState.PRESSED);
        for (const key of keys.reverse())
            this._keyboard.notify_keyval(time, key, Clutter.KeyState.RELEASED);
    }
}
