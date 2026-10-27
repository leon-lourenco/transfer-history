# ADR-0002 — Super+V é tirado da bandeja de notificações e devolvido no disable()

- **Status:** aceita
- **Data:** 2026-10-27

## Contexto

O GNOME já usa <kbd>Super</kbd>+<kbd>V</kbd> (e <kbd>Super</kbd>+<kbd>M</kbd>) para abrir a bandeja de
notificações (`org.gnome.shell.keybindings toggle-message-tray`). Dois atalhos iguais: o Mutter
entrega a tecla a um só, e não ao nosso de forma garantida. O hábito que queremos reproduzir é o do
Windows, onde <kbd>Win</kbd>+<kbd>V</kbd> é o histórico.

## Decisão

No `enable()`, ler `toggle-message-tray`, guardar o valor original na chave interna
`saved-message-tray-binding` da extensão e gravar o mesmo valor **sem** os atalhos que a extensão usa.
No `disable()`, restaurar o valor guardado e limpar a chave interna. Se já houver um valor guardado
(o Shell caiu sem `disable()`), não sobrescrever.

## Consequências

- <kbd>Super</kbd>+<kbd>V</kbd> abre o histórico; a bandeja continua em <kbd>Super</kbd>+<kbd>M</kbd>.
- A extensão grava numa chave do Shell. Por isso a restauração é parte do contrato do `disable()` e
  está coberta pelo teste E2E.
- O Shell chama `disable()` ao bloquear a tela; o atalho volta à bandeja nesse intervalo, o que é
  inofensivo.
- Se o usuário mudar o atalho da extensão para algo que não conflita, nada é alterado no Shell.
