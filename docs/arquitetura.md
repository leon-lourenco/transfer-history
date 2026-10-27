# Arquitetura

Como o Transfer History é montado, do contexto até as classes. Os fluxos no tempo estão em
[fluxos.md](fluxos.md); o formato em disco, em [dados.md](dados.md).

## Requisitos

### Funcionais

| # | Requisito | Onde |
|---|---|---|
| RF1 | Guardar cada texto e imagem copiados em qualquer app | `ClipboardMonitor` → `HistoryStore` |
| RF2 | Abrir o painel com <kbd>Super</kbd>+<kbd>V</kbd>, perto do ponteiro | `extension.js`, `HistoryPopup` |
| RF3 | Clicar ou dar <kbd>Enter</kbd> num item cola na janela focada | `Paster` |
| RF4 | Menu “⋯” por item: Excluir, Fixar/Desafixar, Limpar tudo | `HistoryPopup` |
| RF5 | “Limpar tudo” apaga só os não fixados | `HistoryStore.clearUnpinned` |
| RF6 | Histórico sobrevive a logout e reinício | `HistoryStore` ([ADR-0004](decisoes/0004-persistencia-json-mais-pngs.md)) |
| RF7 | Até 25 itens não fixados; fixados não contam | `HistoryStore._trim` ([ADR-0005](decisoes/0005-limite-de-25-itens-e-fixados-fora-do-limite.md)) |
| RF8 | Visual do Win+V do Windows 10, tema escuro | `stylesheet.css` ([visual.md](visual.md)) |

### Não funcionais (atributos de qualidade)

| Atributo | Meta | Como |
|---|---|---|
| **Privacidade** | Nada sai da máquina; conteúdo de gerenciador de senha não é guardado | Sem rede; arquivos `0600`/`0700`; filtro de MIME sensível |
| **Robustez** | Desligar a extensão deixa o Shell exatamente como estava | `disable()` desfaz sinais, atalhos, timers, atores e o atalho da bandeja |
| **Desempenho** | O Shell nunca trava por causa do histórico | Escrita assíncrona com *debounce* de 500 ms; leitura síncrona só no `enable()` |
| **Compatibilidade** | GNOME Shell 50, Wayland | APIs conferidas no JS do próprio Shell ([AGENTS.md](../AGENTS.md)) |
| **Testabilidade** | Fluxo inteiro testável sem mexer na sessão do usuário | Shell headless isolado em `tests/e2e/` ([operacao.md](operacao.md#teste-de-ponta-a-ponta)) |

## C4 — nível 1: contexto

```mermaid
flowchart TB
    user(["👤 Usuário<br/>copia e cola entre apps"])
    th["<b>Transfer History</b><br/>extensão do GNOME Shell<br/>histórico + painel Win+V"]
    apps["Apps Wayland e Xwayland<br/>donos do conteúdo copiado,<br/>destino do Ctrl+V"]
    shell["GNOME Shell / Mutter 50<br/>compositor: seleção, teclado,<br/>atalhos globais"]
    disk[("Disco do usuário<br/>~/.local/share")]

    user -- "Ctrl+C / Super+V / clique" --> apps
    user -- "Super+V" --> th
    apps -- "oferecem conteúdo à seleção" --> shell
    shell -- "owner-changed, conteúdo" --> th
    th -- "Ctrl+V virtual" --> shell
    shell -- "entrega a tecla à janela focada" --> apps
    th -- "history.json + PNGs" --> disk

    classDef system fill:#1168bd,stroke:#0b4884,color:#fff
    classDef external fill:#666,stroke:#444,color:#fff
    classDef person fill:#08427b,stroke:#052e56,color:#fff
    class th system
    class apps,shell,disk external
    class user person
```

No Wayland, só o compositor vê a área de transferência de todos os apps e só ele injeta teclas
em outra janela. Por isso o sistema vive **dentro** do GNOME Shell
([ADR-0001](decisoes/0001-extensao-gnome-shell-em-vez-de-app.md)).

## C4 — nível 2: contêineres

```mermaid
flowchart LR
    subgraph proc["Processo gnome-shell (GJS + Mutter)"]
        ext["<b>Extensão</b><br/>clipboard-history-win10@leon<br/>JavaScript ESM"]
        st["St / Clutter<br/>widgets, clipboard,<br/>teclado virtual"]
        meta["Meta.Selection<br/>dono da área de transferência"]
        wm["Main.wm<br/>atalhos globais"]
        ext --> st
        ext --> meta
        ext --> wm
    end
    gs[("GSettings / dconf<br/>org.gnome.shell.extensions.<br/>clipboard-history-win10")]
    keys[("GSettings<br/>org.gnome.shell.keybindings<br/>toggle-message-tray")]
    store[("~/.local/share/<br/>clipboard-history-win10/<br/>history.json, images/*.png")]

    ext -- "lê preferências" --> gs
    ext -- "remove/restaura &lt;Super&gt;v" --> keys
    ext -- "Gio, assíncrono" --> store

    classDef system fill:#1168bd,stroke:#0b4884,color:#fff
    classDef external fill:#666,stroke:#444,color:#fff
    class ext system
    class st,meta,wm,gs,keys,store external
```

## C4 — nível 3: componentes

```mermaid
flowchart TB
    subgraph extension["extension/"]
        entry["<b>extension.js</b><br/>TransferHistoryExtension<br/>monta e desmonta tudo;<br/>atalho e troca do Super+V"]
        monitor["<b>clipboardMonitor.js</b><br/>ClipboardMonitor<br/>ouve owner-changed,<br/>filtra MIME, lê texto/PNG"]
        store["<b>historyStore.js</b><br/>HistoryStore<br/>lista, dedupe por SHA-256,<br/>limite, fixar, persistência"]
        popup["<b>popup.js</b><br/>HistoryPopup<br/>painel modal, cartões,<br/>menu ⋯, teclado"]
        paster["<b>paster.js</b><br/>Paster<br/>devolve à área de transferência<br/>e envia Ctrl+V"]
        css["<b>stylesheet.css</b><br/>visual Win10"]
    end

    entry -- cria --> store & monitor & popup & paster
    monitor -- "addText / addImage" --> store
    store -. "sinal changed" .-> popup
    popup -- "onSelect(item)" --> entry
    entry -- "copyAndPaste(item)" --> paster
    paster -- "loadImage(item)" --> store
    popup -- "remove / togglePin / clearUnpinned" --> store
    css -. estiliza .-> popup
```

Dependências apontam para o `HistoryStore`, que não conhece nenhum outro módulo: é o único estado
e o único dono do disco. O painel só **lê** a lista e pede mudanças; redesenha quando ouve `changed`.

## Classes

```mermaid
classDiagram
    direction LR
    class TransferHistoryExtension {
        -GSettings _settings
        -HistoryStore _store
        -ClipboardMonitor _monitor
        -HistoryPopup _popup
        -Paster _paster
        +enable()
        +disable()
        -_releaseSuperV()
        -_restoreSuperV()
    }
    class HistoryStore {
        <<EventEmitter>>
        -Item[] _items
        -int _maxItems
        +items Item[]
        +maxItems int
        +load()
        +addText(text)
        +addImage(bytes, size)
        +remove(id)
        +togglePin(id)
        +clearUnpinned()
        +imagePath(item) string
        +loadImage(item) GLib.Bytes
        +destroy()
        signal changed()
    }
    class ClipboardMonitor {
        -St.Clipboard _clipboard
        -Meta.Selection _selection
        +maxImageBytes int
        +destroy()
        -_read()
        -_onImage(bytes)
    }
    class HistoryPopup {
        -St.Widget _overlay
        -Clutter.Grab _grab
        -string _openMenuId
        +isOpen bool
        +open()
        +close()
        +toggle()
        +destroy()
    }
    class Paster {
        -Clutter.VirtualInputDevice _keyboard
        +copy(item)
        +copyAndPaste(item)
        +destroy()
    }
    class Item {
        +string id
        +string type
        +string hash
        +string text
        +string image
        +int width
        +int height
        +bool pinned
        +int timestamp
    }
    TransferHistoryExtension *-- HistoryStore
    TransferHistoryExtension *-- ClipboardMonitor
    TransferHistoryExtension *-- HistoryPopup
    TransferHistoryExtension *-- Paster
    ClipboardMonitor --> HistoryStore
    HistoryPopup --> HistoryStore
    Paster --> HistoryStore
    HistoryStore o-- "0..*" Item
```

## Implantação

```mermaid
flowchart LR
    subgraph repo["Repositório"]
        src["extension/"]
        schema["schemas/*.gschema.xml"]
        inst["install.sh"]
    end
    subgraph home["~ (usuário)"]
        link["~/.local/share/gnome-shell/extensions/<br/>clipboard-history-win10@leon → repo/extension"]
        compiled["extension/schemas/gschemas.compiled"]
        data["~/.local/share/clipboard-history-win10/"]
        dconf[("~/.config/dconf/user")]
    end
    shell["gnome-shell<br/>(carrega no login)"]

    inst -- "ln -s" --> link
    inst -- "glib-compile-schemas" --> compiled
    src --- link
    shell -- importa --> link
    shell -- "grava em execução" --> data
    shell -- "preferências e atalhos" --> dconf
```

A instalação por *symlink* faz cada edição no repositório valer no próximo login. Para publicar no
extensions.gnome.org, `./install.sh --zip` gera o pacote.

## Decisões

As decisões que moldam esta arquitetura estão em [decisoes/](decisoes/). Resumo:

| ADR | Decisão |
|---|---|
| [0001](decisoes/0001-extensao-gnome-shell-em-vez-de-app.md) | Extensão do GNOME Shell, não app separado |
| [0002](decisoes/0002-super-v-remapeia-bandeja-de-notificacoes.md) | Super+V é tirado da bandeja de notificações e devolvido no `disable()` |
| [0003](decisoes/0003-colar-via-teclado-virtual-do-clutter.md) | Colar com Ctrl+V de um teclado virtual do Clutter |
| [0004](decisoes/0004-persistencia-json-mais-pngs.md) | Persistência em JSON + PNGs por hash |
| [0005](decisoes/0005-limite-de-25-itens-e-fixados-fora-do-limite.md) | Limite de 25 itens; fixados fora do limite |
