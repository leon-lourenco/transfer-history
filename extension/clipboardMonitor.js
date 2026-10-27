// Observa a área de transferência pelo Mutter e entrega cada novo conteúdo ao HistoryStore (ADR-0001).
import GdkPixbuf from 'gi://GdkPixbuf';
import Meta from 'gi://Meta';
import St from 'gi://St';

const IMAGE_MIME = 'image/png';

// Gerenciadores de senha marcam o conteúdo assim; nunca guardamos esses itens.
const SENSITIVE_MIMES = [
    'x-kde-passwordManagerHint',
    'application/x-nspasteboard-concealed-type',
];

export class ClipboardMonitor {
    constructor({store, maxImageBytes}) {
        this._store = store;
        this._maxImageBytes = maxImageBytes;
        this._clipboard = St.Clipboard.get_default();
        this._selection = global.display.get_selection();
        this._ownerChangedId = this._selection.connect('owner-changed',
            (_selection, type) => {
                if (type === Meta.SelectionType.SELECTION_CLIPBOARD)
                    this._read();
            });
    }

    set maxImageBytes(value) {
        this._maxImageBytes = value;
    }

    destroy() {
        this._selection.disconnect(this._ownerChangedId);
        this._ownerChangedId = 0;
        this._store = null;
    }

    _read() {
        const mimetypes = this._clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD);
        if (mimetypes.length === 0 || mimetypes.some(m => SENSITIVE_MIMES.includes(m)))
            return;

        // Navegadores oferecem texto (o endereço) junto da imagem; a imagem vence, como no Windows.
        if (mimetypes.includes(IMAGE_MIME))
            this._clipboard.get_content(St.ClipboardType.CLIPBOARD, IMAGE_MIME, (_c, bytes) => this._onImage(bytes));
        else
            this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (_c, text) => this._store?.addText(text));
    }

    _onImage(bytes) {
        if (!this._store || !bytes || bytes.get_size() === 0 || bytes.get_size() > this._maxImageBytes)
            return;
        try {
            const loader = new GdkPixbuf.PixbufLoader();
            loader.write_bytes(bytes);
            loader.close();
            const pixbuf = loader.get_pixbuf();
            this._store.addImage(bytes, {width: pixbuf.get_width(), height: pixbuf.get_height()});
        } catch (e) {
            console.warn(`[transfer-history] imagem ilegível: ${e.message}`);
        }
    }
}
