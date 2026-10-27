// Painel do histórico com o visual do Win+V do Windows 10 (docs/visual.md).
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';

import {ItemType} from './historyStore.js';

// Precisam bater com .th-panel e .th-item no stylesheet.css.
const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 460;
const THUMB_MAX_WIDTH = 280;
const THUMB_MAX_HEIGHT = 120;
const POINTER_GAP = 8;

const PREVIEW_MAX_LINES = 3;
// Quantos caracteres de 14px cabem numa linha do cartão; estimativa para cortar antes de quebrar.
const PREVIEW_CHARS_PER_LINE = 34;

const OPEN_ANIMATION_MS = 150;

// Até 3 linhas visuais, contando as quebras automáticas, com "…" se sobrar texto.
function previewText(text) {
    const lines = text.replace(/\t/g, '    ').split('\n').filter(line => line.trim());
    const out = [];
    let budget = PREVIEW_MAX_LINES;
    for (const line of lines) {
        if (budget === 0)
            break;
        const wrapped = Math.max(1, Math.ceil(line.length / PREVIEW_CHARS_PER_LINE));
        if (wrapped <= budget) {
            out.push(line);
            budget -= wrapped;
        } else {
            out.push(`${line.slice(0, budget * PREVIEW_CHARS_PER_LINE - 1).trimEnd()}…`);
            budget = 0;
        }
    }
    const preview = out.join('\n');
    return preview.length < lines.join('\n').length && !preview.endsWith('…') ? `${preview}…` : preview;
}

function iconButton(iconName, accessibleName, onClick) {
    const button = new St.Button({
        style_class: 'th-icon-button',
        can_focus: true,
        accessible_name: accessibleName,
        child: new St.Icon({icon_name: iconName, style_class: 'th-icon'}),
    });
    button.connect('clicked', onClick);
    return button;
}

export class HistoryPopup {
    /**
     * @param {object} params
     * @param {import('./historyStore.js').HistoryStore} params.store
     * @param {(item: object) => void} params.onSelect chamado depois que o painel fecha
     */
    constructor({store, onSelect}) {
        this._store = store;
        this._onSelect = onSelect;
        this._overlay = null;
        this._grab = null;
        this._openMenuId = null;
        this._changedId = this._store.connect('changed', () => this._rebuildList());
    }

    get isOpen() {
        return this._overlay !== null;
    }

    toggle() {
        if (this.isOpen)
            this.close();
        else
            this.open();
    }

    open() {
        if (this.isOpen)
            return;

        this._overlay = new St.Widget({
            reactive: true,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
        });
        this._overlay.connect('button-press-event', (_actor, event) => this._onOverlayPress(event));
        this._overlay.connect('touch-event', (_actor, event) => this._onOverlayPress(event));
        this._overlay.connect('key-press-event', (_actor, event) => this._onKeyPress(event));

        this._panel = this._buildPanel();
        this._overlay.add_child(this._panel);
        Main.uiGroup.add_child(this._overlay);
        this._placePanel();

        this._grab = Main.pushModal(this._overlay, {actionMode: Shell.ActionMode.POPUP});
        this._rebuildList();
        this._focusFirst();

        this._panel.set({opacity: 0, translation_y: POINTER_GAP});
        this._panel.ease({
            opacity: 255,
            translation_y: 0,
            duration: OPEN_ANIMATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    close() {
        if (!this.isOpen)
            return;
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        this._overlay.destroy();
        this._overlay = null;
        this._panel = null;
        this._list = null;
        this._scrollView = null;
        this._openMenuId = null;
    }

    destroy() {
        this.close();
        this._store.disconnect(this._changedId);
        this._store = null;
    }

    _buildPanel() {
        const panel = new St.BoxLayout({
            style_class: 'th-panel',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
        });
        // Acrílico do Windows: desfoca o que está atrás do painel.
        panel.add_effect(new Shell.BlurEffect({
            mode: Shell.BlurMode.BACKGROUND,
            radius: 40,
            brightness: 0.75,
        }));

        const header = new St.BoxLayout({style_class: 'th-header'});
        header.add_child(new St.Label({
            text: 'Área de transferência',
            style_class: 'th-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this._clearAllButton = new St.Button({
            label: 'Limpar tudo',
            style_class: 'th-link',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._clearAllButton.connect('clicked', () => this._store.clearUnpinned());
        header.add_child(this._clearAllButton);
        panel.add_child(header);

        this._list = new St.BoxLayout({
            style_class: 'th-list',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        this._scrollView = new St.ScrollView({
            style_class: 'th-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            x_expand: true,
            y_expand: true,
            child: this._list,
        });
        panel.add_child(this._scrollView);
        return panel;
    }

    // O Windows abre junto ao cursor de texto; aqui, junto ao ponteiro, sem sair da área útil do monitor.
    _placePanel() {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const width = PANEL_WIDTH * scale;
        const height = PANEL_HEIGHT * scale;
        const [pointerX, pointerY] = global.get_pointer();
        const area = Main.layoutManager.getWorkAreaForMonitor(global.display.get_current_monitor());

        let x = pointerX;
        let y = pointerY + POINTER_GAP * scale;
        if (y + height > area.y + area.height)
            y = pointerY - height - POINTER_GAP * scale;
        x = Math.clamp(x, area.x, area.x + area.width - width);
        y = Math.clamp(y, area.y, area.y + area.height - height);
        this._panel.set_position(Math.round(x), Math.round(y));
    }

    _rebuildList() {
        if (!this._list)
            return;
        const focusedId = this._focusedItemId();
        this._list.destroy_all_children();

        const items = this._store.items;
        // Esconde sem tirar do layout, para o cabeçalho não mudar de altura.
        const canClear = items.some(item => !item.pinned);
        this._clearAllButton.set({opacity: canClear ? 255 : 0, reactive: canClear, can_focus: canClear});
        if (items.length === 0) {
            this._list.add_child(this._buildEmptyState());
            return;
        }
        for (const item of items)
            this._list.add_child(this._buildItem(item));

        if (focusedId && this._cards().some(c => c._itemId === focusedId))
            this._focusItem(focusedId);
        else if (!this._panel.contains(global.stage.get_key_focus()))
            this._focusFirst();
    }

    _buildEmptyState() {
        const box = new St.BoxLayout({
            style_class: 'th-empty',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        box.add_child(new St.Label({
            text: 'Nada aqui ainda',
            style_class: 'th-empty-title',
        }));
        const body = new St.Label({
            text: 'Você verá o histórico da área de transferência aqui depois de copiar algo.',
            style_class: 'th-empty-body',
        });
        body.clutter_text.line_wrap = true;
        box.add_child(body);
        return box;
    }

    // O cartão não é um botão só: botões aninhados disputam o clique. O conteúdo é o botão de colar,
    // e o "⋯" fica ao lado.
    _buildItem(item) {
        const card = new St.BoxLayout({
            style_class: 'th-item',
            track_hover: true,
            reactive: true,
            x_expand: true,
        });
        card._itemId = item.id;

        const content = new St.Button({
            style_class: 'th-item-content',
            can_focus: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            accessible_name: item.type === ItemType.TEXT ? item.text.slice(0, 80) : 'Imagem',
            child: item.type === ItemType.TEXT ? this._buildTextPreview(item) : this._buildImagePreview(item),
        });
        content.connect('clicked', () => this._select(item));
        content.connect('key-focus-in', () => {
            card.add_style_pseudo_class('focus');
            ensureActorVisibleInScrollView(this._scrollView, card);
        });
        content.connect('key-focus-out', () => card.remove_style_pseudo_class('focus'));
        card._content = content;
        card.add_child(content);

        const menuOpen = this._openMenuId === item.id;
        const side = new St.BoxLayout({
            style_class: 'th-item-side',
            orientation: menuOpen ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.START,
        });
        if (menuOpen) {
            side.add_style_class_name('th-menu');
            side.add_child(iconButton('user-trash-symbolic', 'Excluir', () => this._store.remove(item.id)));
            side.add_child(iconButton('view-pin-symbolic', item.pinned ? 'Desafixar' : 'Fixar', () => {
                this._openMenuId = null;
                this._store.togglePin(item.id);
            }));
            side.add_child(iconButton('edit-clear-all-symbolic', 'Limpar tudo', () => {
                this._openMenuId = null;
                this._store.clearUnpinned();
            }));
        } else {
            side.add_child(iconButton('view-more-horizontal-symbolic', 'Ver mais', () => {
                this._openMenuId = item.id;
                this._rebuildList();
                this._focusItem(item.id, {menu: true});
            }));
            if (item.pinned) {
                side.add_child(new St.Icon({
                    icon_name: 'view-pin-symbolic',
                    style_class: 'th-icon th-pin-badge',
                    x_align: Clutter.ActorAlign.CENTER,
                }));
            }
        }
        card._side = side;
        card.add_child(side);
        return card;
    }

    _buildTextPreview(item) {
        const label = new St.Label({
            text: previewText(item.text),
            style_class: 'th-item-text',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        // Sem ellipsize: com ele a altura mínima vira uma linha e o ScrollView espreme o cartão.
        // O corte em 3 linhas é feito antes, em previewText().
        label.clutter_text.line_wrap = true;
        label.clutter_text.ellipsize = 0; // Pango.EllipsizeMode.NONE
        return label;
    }

    _buildImagePreview(item) {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const fit = Math.min(1, THUMB_MAX_WIDTH / item.width, THUMB_MAX_HEIGHT / item.height);
        const path = this._store.imagePath(item).replace(/"/g, '\\"');
        return new St.Widget({
            style_class: 'th-item-image',
            width: Math.max(1, Math.round(item.width * fit)) * scale,
            height: Math.max(1, Math.round(item.height * fit)) * scale,
            style: `background-image: url("file://${path}"); background-size: contain;`,
            x_align: Clutter.ActorAlign.START,
        });
    }

    _select(item) {
        this.close();
        this._onSelect(item);
    }

    _cards() {
        return this._list?.get_children().filter(child => child._itemId) ?? [];
    }

    _focusedItemId() {
        const focus = global.stage.get_key_focus();
        return this._cards().find(card => card.contains(focus))?._itemId ?? null;
    }

    _focusFirst() {
        const [first] = this._cards();
        (first?._content ?? this._clearAllButton).grab_key_focus();
    }

    _focusItem(id, {menu = false} = {}) {
        const card = this._cards().find(c => c._itemId === id);
        if (!card)
            return;
        const target = menu ? card._side.get_first_child() : card._content;
        // A lista acabou de ser recriada; o foco só vale depois da alocação.
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (target.get_stage())
                target.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        });
    }

    _onOverlayPress(event) {
        const type = event.type();
        if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.TOUCH_BEGIN)
            return Clutter.EVENT_PROPAGATE;
        const target = global.stage.get_event_actor(event);
        if (!this._panel.contains(target)) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        if (this._openMenuId && !this._cards().find(c => c._itemId === this._openMenuId)?._side.contains(target)) {
            this._openMenuId = null;
            this._rebuildList();
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onKeyPress(event) {
        const key = event.get_key_symbol();
        const focus = global.stage.get_key_focus();

        switch (key) {
        case Clutter.KEY_Escape:
            if (this._openMenuId) {
                const id = this._openMenuId;
                this._openMenuId = null;
                this._rebuildList();
                this._focusItem(id);
            } else {
                this.close();
            }
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Up:
        case Clutter.KEY_Down:
            this._panel.navigate_focus(focus,
                key === Clutter.KEY_Up ? St.DirectionType.UP : St.DirectionType.DOWN, false);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Delete: {
            const id = this._focusedItemId();
            if (!id)
                return Clutter.EVENT_STOP;
            const cards = this._cards();
            const index = cards.findIndex(c => c._itemId === id);
            const neighbor = cards[index + 1] ?? cards[index - 1];
            this._store.remove(id);
            if (neighbor)
                this._focusItem(neighbor._itemId);
            return Clutter.EVENT_STOP;
        }
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }
}
