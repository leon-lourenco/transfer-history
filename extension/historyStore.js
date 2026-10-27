// Histórico em memória com persistência em disco (ADR-0004) e limite de itens (ADR-0005).
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

const FORMAT_VERSION = 1;
const SAVE_DELAY_MS = 500;
const MAX_TEXT_LENGTH = 1024 * 1024;

export const ItemType = Object.freeze({
    TEXT: 'text',
    IMAGE: 'image',
});

/**
 * Signals:
 *  - 'changed' (): a lista mudou; a interface deve se redesenhar.
 */
export class HistoryStore extends EventEmitter {
    constructor({dataDir, maxItems}) {
        super();
        this._dataDir = Gio.File.new_for_path(dataDir);
        this._imagesDir = this._dataDir.get_child('images');
        this._file = this._dataDir.get_child('history.json');
        this._maxItems = maxItems;
        this._items = [];
        this._saveId = 0;
    }

    /** Itens do mais recente para o mais antigo. */
    get items() {
        return this._items;
    }

    set maxItems(value) {
        this._maxItems = value;
        if (this._trim())
            this._changed();
    }

    load() {
        GLib.mkdir_with_parents(this._imagesDir.get_path(), 0o700);
        try {
            const [, bytes] = this._file.load_contents(null);
            const data = JSON.parse(new TextDecoder().decode(bytes));
            if (data.version !== FORMAT_VERSION)
                throw new Error(`versão ${data.version} desconhecida`);
            this._items = data.items.filter(item => this._isValid(item));
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                console.warn(`[transfer-history] histórico ignorado: ${e.message}`);
            this._items = [];
        }
        this._trim();
    }

    addText(text) {
        if (!text || !text.trim())
            return;
        if (text.length > MAX_TEXT_LENGTH)
            text = text.slice(0, MAX_TEXT_LENGTH);
        const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, text, -1);
        if (this._promote(hash))
            return;
        this._insert({id: GLib.uuid_string_random(), type: ItemType.TEXT, hash, text});
    }

    /** @param {GLib.Bytes} bytes conteúdo PNG */
    addImage(bytes, {width, height}) {
        const hash = GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, bytes);
        if (this._promote(hash))
            return;
        const file = this._imagesDir.get_child(`${hash}.png`);
        if (!file.query_exists(null)) {
            file.replace_contents_bytes_async(bytes, null, false,
                Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null,
                (f, res) => {
                    try {
                        f.replace_contents_finish(res);
                    } catch (e) {
                        console.warn(`[transfer-history] imagem não gravada: ${e.message}`);
                    }
                });
        }
        this._insert({
            id: GLib.uuid_string_random(), type: ItemType.IMAGE, hash,
            image: file.get_basename(), width, height,
        });
    }

    imagePath(item) {
        return this._imagesDir.get_child(item.image).get_path();
    }

    /** Lê os bytes de uma imagem guardada, para devolvê-la à área de transferência. */
    loadImage(item) {
        const [, bytes] = this._imagesDir.get_child(item.image).load_contents(null);
        return GLib.Bytes.new(bytes);
    }

    remove(id) {
        const index = this._items.findIndex(item => item.id === id);
        if (index < 0)
            return;
        const [removed] = this._items.splice(index, 1);
        this._deleteImageIfOrphan(removed);
        this._changed();
    }

    togglePin(id) {
        const item = this._items.find(i => i.id === id);
        if (!item)
            return;
        item.pinned = !item.pinned;
        this._trim();
        this._changed();
    }

    /** Como no Windows: "Limpar tudo" preserva os fixados. */
    clearUnpinned() {
        const removed = this._items.filter(item => !item.pinned);
        this._items = this._items.filter(item => item.pinned);
        removed.forEach(item => this._deleteImageIfOrphan(item));
        this._changed();
    }

    /** Grava o que estiver pendente e solta os timers. Chamado no disable(). */
    destroy() {
        if (this._saveId) {
            GLib.source_remove(this._saveId);
            this._saveId = 0;
            this._writeSync();
        }
        this.disconnectAll();
    }

    _isValid(item) {
        if (typeof item?.id !== 'string' || typeof item.hash !== 'string')
            return false;
        if (item.type === ItemType.TEXT)
            return typeof item.text === 'string';
        if (item.type === ItemType.IMAGE)
            return typeof item.image === 'string' && this._imagesDir.get_child(item.image).query_exists(null);
        return false;
    }

    // Copiar de novo algo que já está no histórico só o traz para o topo.
    _promote(hash) {
        const index = this._items.findIndex(item => item.hash === hash);
        if (index < 0)
            return false;
        const [item] = this._items.splice(index, 1);
        item.timestamp = Date.now();
        this._items.unshift(item);
        this._changed();
        return true;
    }

    _insert(item) {
        this._items.unshift({...item, pinned: false, timestamp: Date.now()});
        this._trim();
        this._changed();
    }

    // Fixados não contam para o limite; descarta os não fixados mais antigos.
    _trim() {
        let unpinned = 0;
        const kept = [];
        const dropped = [];
        for (const item of this._items) {
            if (item.pinned || ++unpinned <= this._maxItems)
                kept.push(item);
            else
                dropped.push(item);
        }
        if (dropped.length === 0)
            return false;
        this._items = kept;
        dropped.forEach(item => this._deleteImageIfOrphan(item));
        return true;
    }

    _deleteImageIfOrphan(item) {
        if (item.type !== ItemType.IMAGE || this._items.some(i => i.image === item.image))
            return;
        this._imagesDir.get_child(item.image).delete_async(GLib.PRIORITY_DEFAULT, null, (f, res) => {
            try {
                f.delete_finish(res);
            } catch {
                // já não existia
            }
        });
    }

    _changed() {
        this.emit('changed');
        if (this._saveId)
            return;
        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY_MS, () => {
            this._saveId = 0;
            this._writeAsync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _serialize() {
        const json = JSON.stringify({version: FORMAT_VERSION, items: this._items});
        return new GLib.Bytes(new TextEncoder().encode(json));
    }

    _writeAsync() {
        this._file.replace_contents_bytes_async(this._serialize(), null, false,
            Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null,
            (f, res) => {
                try {
                    f.replace_contents_finish(res);
                } catch (e) {
                    console.warn(`[transfer-history] histórico não gravado: ${e.message}`);
                }
            });
    }

    _writeSync() {
        try {
            this._file.replace_contents(this._serialize().toArray(), null, false,
                Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.warn(`[transfer-history] histórico não gravado: ${e.message}`);
        }
    }
}
