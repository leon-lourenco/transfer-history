# ADR-0003 — Colar com Ctrl+V de um teclado virtual do Clutter

- **Status:** aceita
- **Data:** 2026-10-27

## Contexto

No Windows, escolher um item do Win+V cola na hora. Para isso o item precisa voltar à área de
transferência e a janela de destino precisa receber o atalho de colar. Não existe API do Wayland
para “mandar colar”.

## Decisão

1. Devolver o item com `St.Clipboard.set_text` / `set_content('image/png')`.
2. Fechar o painel (soltar o *grab* modal), esperar **120 ms** para o foco voltar à janela.
3. Enviar <kbd>Ctrl</kbd>+<kbd>V</kbd> por um `Clutter.VirtualInputDevice` de teclado, o mesmo
   mecanismo do teclado na tela do GNOME. Se o `wm_class` da janela focada for de um terminal
   conhecido, enviar <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>.

A preferência `paste-on-select = false` desliga o passo 3.

## Consequências

- Funciona em apps Wayland e Xwayland sem privilégios, porque a tecla nasce no compositor.
- Apps com atalho de colar diferente não recebem a colagem; o item fica na área de transferência
  e o usuário cola à mão.
- A lista de terminais é heurística e precisa de manutenção (`TERMINAL_WM_CLASSES` em `paster.js`).
- O `set_text` dispara `owner-changed`; o item já existe, então só sobe para o topo — o mesmo
  comportamento de copiar de novo.
