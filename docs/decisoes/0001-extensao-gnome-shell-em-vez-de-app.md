# ADR-0001 — Extensão do GNOME Shell em vez de app separado

- **Status:** aceita
- **Data:** 2026-10-27

## Contexto

O alvo é GNOME 50 em **Wayland**. O histórico precisa de três coisas que o Wayland nega a um app
comum, por segurança:

1. **ler a área de transferência em segundo plano** — só a janela com foco recebe o conteúdo;
2. **atalho global** (<kbd>Super</kbd>+<kbd>V</kbd>) — apps não registram atalhos globais sem portal;
3. **colar em outra janela** — apps não injetam teclas em outras janelas.

Alternativas avaliadas:

| Opção | Ler em 2º plano | Atalho global | Colar | Veredito |
|---|---|---|---|---|
| App GTK 4 + `wl-paste --watch` | só com `wlr-data-control`, que o Mutter não implementa | via atalho personalizado do GNOME chamando o app | `ydotool` (root, `/dev/uinput`) | frágil e pede privilégio |
| App + portal RemoteDesktop para colar | não resolve a leitura | idem | pede permissão a cada sessão | incompleto |
| **Extensão do GNOME Shell** | `Meta.Selection` `owner-changed` | `Main.wm.addKeybinding` | teclado virtual do Clutter | tudo nativo |

## Decisão

Implementar como **extensão do GNOME Shell** em GJS (ESM), rodando dentro do processo do
compositor, com a interface em St/Clutter.

## Consequências

- Acesso nativo e sem privilégios extras às três capacidades.
- Um erro na extensão afeta o Shell: o `disable()` precisa desfazer tudo, e as APIs são conferidas
  contra o JS do Shell instalado ([AGENTS.md](../../AGENTS.md)).
- Preso ao GNOME e a versões do Shell (`shell-version` no `metadata.json`); outra versão exige
  revisão.
- Teste automatizado exige um Shell de verdade — daí o E2E headless em `tests/e2e/`.
