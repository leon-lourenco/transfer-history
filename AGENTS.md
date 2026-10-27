# Transfer History — instruções para agentes

Extensão do GNOME Shell (GJS) que recria o histórico da área de transferência do
Windows 10 (Win+V), com o mesmo visual, no GNOME 50 em Wayland.

## Mapa do repositório

| Caminho | O quê |
|---|---|
| `extension/` | código da extensão (UUID `clipboard-history-win10@leon`) |
| `extension/schemas/` | schema GSettings (o `.compiled` é gerado, não vai para o git) |
| `install.sh` | instala por symlink em `~/.local/share/gnome-shell/extensions` e compila o schema |
| `docs/` | arquitetura, fluxos, dados, visual, operação e ADRs (`docs/decisoes/`) |

## Regras

- **Idioma:** documentação e textos da interface em português do Brasil; identificadores no código em inglês.
- **APIs do Shell:** confira contra o JS real do GNOME Shell 50 (extraia com
  `gresource list /usr/lib/gnome-shell/libshell-18.so`), não contra memória. Imports ESM
  (`gi://`, `resource:///org/gnome/shell/...`).
- **`disable()` desfaz tudo:** sinais, atalhos, atores, timeouts e o atalho `<Super>v` da bandeja de
  notificações (ADR-0002). Uma extensão que vaza estado quebra o Shell do usuário.
- **Visual:** segue `docs/visual.md`. Mudou cor ou medida no `stylesheet.css`, atualize a tabela de lá.
- **Decisões:** toda decisão de arquitetura nova vira um ADR em `docs/decisoes/NNNN-titulo.md`
  (contexto, decisão, consequências) e entra no índice de `docs/README.md`.
- **Diagramas:** sempre em Mermaid, dentro do Markdown. Ao mudar o código, atualize o diagrama
  afetado no mesmo commit.
- **Documentação em dois lugares:** o repositório é a fonte da verdade. O espaço
  **“Transfer History”** no Daily Stasis espelha `docs/` (via MCP `daily-stasis`, tools
  `create_doc_page`/`update_doc_page`). Ao mudar `docs/`, atualize a página correspondente.
- **Testar:** sessão aninhada (`docs/operacao.md`) e logs com `journalctl -f -o cat /usr/bin/gnome-shell`.
  Não reinicie o Shell do usuário sem pedir.
