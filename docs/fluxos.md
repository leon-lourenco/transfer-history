# Fluxos

O comportamento no tempo: o que acontece ao copiar, ao colar pelo painel e ao ligar/desligar a
extensão. A estrutura estática está em [arquitetura.md](arquitetura.md).

## 1. Copiar → guardar

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário
    participant App as App (qualquer)
    participant Sel as Meta.Selection
    participant Mon as ClipboardMonitor
    participant Clip as St.Clipboard
    participant Store as HistoryStore
    participant Disk as Disco

    U->>App: Ctrl+C
    App->>Sel: vira dono da CLIPBOARD
    Sel-->>Mon: owner-changed(SELECTION_CLIPBOARD)
    Mon->>Clip: get_mimetypes()
    alt MIME de gerenciador de senha
        Mon-->>Mon: ignora
    else tem image/png
        Mon->>Clip: get_content('image/png')
        Clip-->>Mon: bytes
        Mon->>Mon: PixbufLoader → largura × altura
        Mon->>Store: addImage(bytes, tamanho)
    else texto
        Mon->>Clip: get_text()
        Clip-->>Mon: texto
        Mon->>Store: addText(texto)
    end
    Store->>Store: SHA-256 do conteúdo
    alt hash já existe
        Store->>Store: move o item para o topo
    else novo
        Store->>Store: insere no topo e aplica o limite
    end
    Store-->>Store: emit('changed')
    Note over Store,Disk: debounce de 500 ms
    Store->>Disk: history.json (+ images/<hash>.png)
```

## 2. Super+V → colar

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário
    participant WM as Main.wm
    participant Ext as extension.js
    participant Pop as HistoryPopup
    participant Pas as Paster
    participant Clip as St.Clipboard
    participant KB as Teclado virtual
    participant App as Janela focada

    U->>WM: Super+V
    WM->>Ext: keybinding toggle-history
    Ext->>Pop: toggle() → open()
    Pop->>Pop: posiciona junto ao ponteiro, pushModal (grab)
    Pop-->>U: painel aparece, foco no 1º cartão
    U->>Pop: ↑/↓ e Enter (ou clique)
    Pop->>Pop: close() → popModal (foco volta ao app)
    Pop->>Ext: onSelect(item)
    Ext->>Pas: copyAndPaste(item)
    Pas->>Clip: set_text / set_content(image/png)
    Note over Pas: espera 120 ms o foco assentar
    Pas->>Pas: terminal? → Ctrl+Shift+V
    Pas->>KB: Ctrl ↓, V ↓, V ↑, Ctrl ↑
    KB->>App: atalho de colar
    App->>Clip: lê o conteúdo
    Note over Clip: o próprio set_text dispara owner-changed,<br/>o item já existe e só sobe para o topo
```

Com a preferência `paste-on-select = false`, o passo do teclado virtual não acontece: o item só
volta para a área de transferência.

## 3. Ligar e desligar a extensão

```mermaid
sequenceDiagram
    autonumber
    participant Shell as GNOME Shell
    participant Ext as extension.js
    participant GS as GSettings da extensão
    participant Keys as org.gnome.shell.keybindings

    Shell->>Ext: enable()
    Ext->>Ext: cria Store (load), Monitor, Paster, Popup
    Ext->>Keys: lê toggle-message-tray
    alt contém <Super>v
        Ext->>GS: guarda o valor original (se ainda não guardado)
        Ext->>Keys: grava sem <Super>v
    end
    Ext->>Shell: addKeybinding('toggle-history')

    Note over Shell,Ext: … uso normal …<br/>(o Shell também chama disable() ao bloquear a tela)

    Shell->>Ext: disable()
    Ext->>Shell: removeKeybinding('toggle-history')
    Ext->>GS: lê o valor guardado
    Ext->>Keys: restaura toggle-message-tray
    Ext->>GS: limpa o valor guardado
    Ext->>Ext: destroy() em Popup, Paster, Monitor, Store (grava pendências)
```

Se o Shell cair sem chamar `disable()`, o valor original continua guardado e o próximo `enable()`
não o sobrescreve ([ADR-0002](decisoes/0002-super-v-remapeia-bandeja-de-notificacoes.md)).

## Estados do painel

```mermaid
stateDiagram-v2
    [*] --> Fechado
    Fechado --> Aberto: Super+V
    Aberto --> Fechado: Esc / clique fora / Super+V
    Aberto --> MenuAberto: clique no ⋯
    MenuAberto --> Aberto: Esc / clique fora do menu
    MenuAberto --> Aberto: Excluir / Fixar / Limpar tudo
    Aberto --> Colando: Enter / clique no item
    Colando --> Fechado: Ctrl+V enviado
    Fechado --> [*]: disable()
```

## Ciclo de vida de um item

```mermaid
stateDiagram-v2
    [*] --> Recente: copiado
    Recente --> Recente: copiado de novo (sobe ao topo)
    Recente --> Fixado: Fixar
    Fixado --> Recente: Desafixar
    Recente --> [*]: Excluir / Limpar tudo / passou do limite
    Fixado --> [*]: Excluir
    note right of Fixado
        Não conta para o limite
        e sobrevive a "Limpar tudo"
    end note
```
