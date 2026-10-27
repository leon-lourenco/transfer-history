// Ponto de entrada: monta monitor, histórico, painel e atalho; o disable() desfaz tudo.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ClipboardMonitor} from './clipboardMonitor.js';
import {HistoryStore} from './historyStore.js';
import {HistoryPopup} from './popup.js';
import {Paster} from './paster.js';

const TOGGLE_KEY = 'toggle-history';
const SHELL_KEYBINDINGS_SCHEMA = 'org.gnome.shell.keybindings';
const MESSAGE_TRAY_KEY = 'toggle-message-tray';
const DATA_DIR_NAME = 'clipboard-history-win10';

export default class TransferHistoryExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._store = new HistoryStore({
            dataDir: GLib.build_filenamev([GLib.get_user_data_dir(), DATA_DIR_NAME]),
            maxItems: this._settings.get_int('max-items'),
        });
        this._store.load();

        this._monitor = new ClipboardMonitor({
            store: this._store,
            maxImageBytes: this._settings.get_int('max-image-bytes'),
        });
        this._paster = new Paster({store: this._store});
        this._popup = new HistoryPopup({
            store: this._store,
            onSelect: item => {
                if (this._settings.get_boolean('paste-on-select'))
                    this._paster.copyAndPaste(item);
                else
                    this._paster.copy(item);
            },
        });

        this._settingsIds = [
            this._settings.connect('changed::max-items',
                () => (this._store.maxItems = this._settings.get_int('max-items'))),
            this._settings.connect('changed::max-image-bytes',
                () => (this._monitor.maxImageBytes = this._settings.get_int('max-image-bytes'))),
        ];

        this._releaseSuperV();
        Main.wm.addKeybinding(TOGGLE_KEY, this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._popup.toggle());
    }

    disable() {
        Main.wm.removeKeybinding(TOGGLE_KEY);
        this._restoreSuperV();

        this._settingsIds.forEach(id => this._settings.disconnect(id));
        this._settingsIds = null;

        this._popup.destroy();
        this._paster.destroy();
        this._monitor.destroy();
        this._store.destroy();
        this._popup = null;
        this._paster = null;
        this._monitor = null;
        this._store = null;
        this._settings = null;
    }

    // O GNOME usa Super+V para a bandeja de notificações. Tiramos só esse atalho de lá e
    // guardamos o valor original para devolver no disable() (ADR-0002).
    _releaseSuperV() {
        const shellKeys = new Gio.Settings({schema_id: SHELL_KEYBINDINGS_SCHEMA});
        const ours = this._settings.get_strv(TOGGLE_KEY).map(a => a.toLowerCase());
        const current = shellKeys.get_strv(MESSAGE_TRAY_KEY);
        const remaining = current.filter(a => !ours.includes(a.toLowerCase()));
        if (remaining.length === current.length)
            return;
        // Se o Shell caiu sem disable(), o valor salvo ainda é o original; não sobrescreve.
        if (this._settings.get_strv('saved-message-tray-binding').length === 0)
            this._settings.set_strv('saved-message-tray-binding', current);
        shellKeys.set_strv(MESSAGE_TRAY_KEY, remaining);
    }

    _restoreSuperV() {
        const saved = this._settings.get_strv('saved-message-tray-binding');
        if (saved.length === 0)
            return;
        new Gio.Settings({schema_id: SHELL_KEYBINDINGS_SCHEMA}).set_strv(MESSAGE_TRAY_KEY, saved);
        this._settings.reset('saved-message-tray-binding');
    }
}
