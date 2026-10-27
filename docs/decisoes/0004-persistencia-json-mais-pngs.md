# ADR-0004 — Persistência em JSON + PNGs por hash

- **Status:** aceita
- **Data:** 2026-10-27

## Contexto

O histórico precisa sobreviver a logout e reinício (no Windows, só os fixados sobrevivem; aqui,
decidimos guardar tudo). São no máximo dezenas de itens. Imagens podem ter megabytes.

Opções: SQLite (via `Gda` ou `GOM`, dependências extras no Shell), GVariant em arquivo, JSON.

## Decisão

- `~/.local/share/clipboard-history-win10/history.json` com `{version, items[]}`.
- Imagens fora do JSON, em `images/<sha256>.png`, gravadas uma vez; o item guarda só o nome.
- Gravação assíncrona (`replace_contents_bytes_async`) 500 ms depois da última mudança; no
  `disable()`, gravação síncrona do que estiver pendente.
- Arquivos com `G_FILE_CREATE_PRIVATE` (0600) e diretório 0700.

## Consequências

- Zero dependências além de GLib/Gio; o arquivo é legível e fácil de apagar.
- Reescreve o JSON inteiro a cada mudança — irrelevante para dezenas de itens.
- `version` permite migrar o formato no futuro.
- O conteúdo fica em texto claro no disco do usuário; quem precisa de mais proteção deve usar
  disco criptografado. Conteúdo marcado por gerenciadores de senha nunca é gravado.
