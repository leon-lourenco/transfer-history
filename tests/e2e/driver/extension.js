// Extensão que só existe no teste E2E: executa o cenário dentro do Shell headless.
// Cada verificação grava "PASS ..." ou "FAIL ..." em $TH_OUT/log.txt; o fim grava "DONE".
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot');

const OUT = GLib.getenv('TH_OUT');
const UUID = 'clipboard-history-win10@leon';
const T = St.ClipboardType.CLIPBOARD;
const LONG_TEXT = 'Olá, mundo! Este é um texto um pouco mais longo para ver como o cartão quebra a ' +
    'linha e mostra reticências quando passa do limite de três linhas de prévia.';

const sleep = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));

function log(line) {
    const stream = Gio.File.new_for_path(`${OUT}/log.txt`).append_to(Gio.FileCreateFlags.NONE, null);
    stream.write_all(new TextEncoder().encode(`${line}\n`), null);
    stream.close(null);
}

function check(name, ok, detail = '') {
    log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

async function screenshot(name) {
    const stream = Gio.File.new_for_path(`${OUT}/${name}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
    await new Shell.Screenshot().screenshot(false, stream);
    stream.close(null);
}

function samplePng() {
    const image = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, 640, 360);
    image.fill(0x3a7bd5ff);
    const [, buffer] = image.save_to_bufferv('png', [], []);
    return GLib.Bytes.new(buffer);
}

function readFile(path) {
    try {
        return new TextDecoder().decode(Gio.File.new_for_path(path).load_contents(null)[1]);
    } catch {
        return null;
    }
}

export default class E2EDriver extends Extension {
    enable() {
        if (this._started)
            return;
        this._started = true;
        this._run()
            .catch(e => log(`FAIL exceção: ${e}\n${e.stack}`))
            .finally(() => log('DONE'));
    }

    disable() {}

    async _run() {
        for (let i = 0; i < 100 && !global.display.focus_window; i++)
            await sleep(200);
        Main.overview.hide();
        await sleep(800);

        const ext = Main.extensionManager.lookup(UUID);
        check('extensão ativa', ext?.state === 1, ext?.error ?? '');
        const th = ext.stateObj;
        const shellKeys = new Gio.Settings({schema_id: 'org.gnome.shell.keybindings'});
        check('Super+V saiu da bandeja', !shellKeys.get_strv('toggle-message-tray').includes('<Super>v'));

        const clipboard = St.Clipboard.get_default();
        for (const copy of [
            () => clipboard.set_text(T, 'Primeiro texto copiado'),
            () => clipboard.set_text(T, 'function soma(a, b) {\n    return a + b;\n}\n\nconsole.log(soma(2, 3));'),
            () => clipboard.set_content(T, 'image/png', samplePng()),
            () => clipboard.set_text(T, 'https://github.com/leon-lourenco/transfer-history'),
            () => clipboard.set_text(T, LONG_TEXT),
            () => clipboard.set_text(T, 'Primeiro texto copiado'),
        ]) {
            copy();
            await sleep(350);
        }
        const items = th._store.items;
        check('captura texto e imagem', items.length === 5, `${items.length} itens`);
        check('copiar de novo traz para o topo sem duplicar', items[0].text === 'Primeiro texto copiado');
        check('imagem guardada com dimensões', items.some(i => i.type === 'image' && i.width === 640));

        th._popup.open();
        await sleep(600);
        await screenshot('01-painel');
        const cards = th._popup._list.get_children();
        check('cartões no tamanho natural (lista rola)',
            cards.every(c => Math.abs(c.height - c.get_preferred_height(c.width)[1]) < 1));

        th._popup._openMenuId = items[1].id;
        th._popup._rebuildList();
        await sleep(400);
        await screenshot('02-menu');
        th._popup._openMenuId = null;
        th._store.togglePin(items.find(i => i.type === 'image').id);
        await sleep(400);
        await screenshot('03-fixado');
        th._popup.close();
        await sleep(300);

        // Fluxo real pelo teclado: Super+V, seta para baixo, Enter, e o texto aparece no app focado.
        const keyboard = Clutter.get_default_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const press = async (...keys) => {
            const time = GLib.get_monotonic_time();
            keys.forEach(k => keyboard.notify_keyval(time, k, Clutter.KeyState.PRESSED));
            [...keys].reverse().forEach(k => keyboard.notify_keyval(time, k, Clutter.KeyState.RELEASED));
            await sleep(250);
        };
        await press(Clutter.KEY_Super_L, Clutter.KEY_v);
        await sleep(300);
        check('Super+V abre o painel', th._popup.isOpen);
        if (!th._popup.isOpen)
            th._popup.open();
        await press(Clutter.KEY_Down);
        await screenshot('04-foco-teclado');
        await press(Clutter.KEY_Return);
        await sleep(1000);
        check('Enter fecha o painel', !th._popup.isOpen);
        const pasted = readFile(`${OUT}/pasted.txt`);
        check('Enter cola no app focado', pasted === LONG_TEXT, JSON.stringify(pasted?.slice(0, 30)));

        await sleep(700);
        const saved = JSON.parse(readFile(`${GLib.get_user_data_dir()}/clipboard-history-win10/history.json`));
        check('histórico persistido', saved.items.length === 5 && saved.items.filter(i => i.pinned).length === 1);

        th._store.clearUnpinned();
        check('"Limpar tudo" preserva fixados', th._store.items.length === 1 && th._store.items[0].pinned);
        th._popup.open();
        await sleep(400);
        th._store.remove(th._store.items[0].id);
        await sleep(300);
        await screenshot('05-vazio');
        th._popup.close();

        Main.extensionManager.disableExtension(UUID);
        await sleep(500);
        check('disable devolve o Super+V à bandeja', shellKeys.get_strv('toggle-message-tray').includes('<Super>v'));
        Main.extensionManager.enableExtension(UUID);
        await sleep(500);
        check('reabilita sem erro', Main.extensionManager.lookup(UUID).state === 1);
    }
}
