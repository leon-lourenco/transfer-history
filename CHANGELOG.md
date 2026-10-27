# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões em
[SemVer](https://semver.org/lang/pt-BR/).

## [1.0.0] — 2026-10-27

### Adicionado
- Painel com o visual do Win+V do Windows 10 (tema escuro, acrílico), aberto com Super+V.
- Histórico de texto e imagens PNG, com dedupe por SHA-256 e limite de 25 itens não fixados.
- Colar direto na janela anterior (Ctrl+V; Ctrl+Shift+V em terminais).
- Menu ⋯ por item: Excluir, Fixar/Desafixar, Limpar tudo.
- Persistência em `~/.local/share/clipboard-history-win10/`.
- Navegação por teclado (↑ ↓ Enter Delete Esc).
- Super+V tirado da bandeja de notificações e devolvido ao desligar.
- Teste E2E em GNOME Shell headless isolado.
- Documentação de arquitetura (C4, sequências, estados, dados, visual) e ADRs 0001–0005.
