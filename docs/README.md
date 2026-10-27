# Documentação

Tudo o que explica **por que** e **como** o Transfer History funciona. Para instalar e usar, comece
pelo [README do projeto](../README.md).

| Página | Para quem | O que tem |
|---|---|---|
| [arquitetura.md](arquitetura.md) | quem vai mexer no código | requisitos, C4 (contexto, contêineres, componentes), classes, implantação |
| [fluxos.md](fluxos.md) | quem vai depurar | sequências (copiar, colar, ligar/desligar) e máquinas de estado |
| [dados.md](dados.md) | quem quer saber o que fica no disco | modelo, formato do `history.json`, regras, preferências |
| [visual.md](visual.md) | quem vai mexer no CSS | medidas, cores, tipografia, estados, armadilhas do St |
| [operacao.md](operacao.md) | quem instala, testa ou remove | instalação, configuração, depuração, teste E2E, problemas comuns |
| [decisoes/](decisoes/) | quem quer o histórico das escolhas | ADRs |

## Decisões (ADRs)

| # | Título | Status |
|---|---|---|
| [0001](decisoes/0001-extensao-gnome-shell-em-vez-de-app.md) | Extensão do GNOME Shell em vez de app separado | aceita |
| [0002](decisoes/0002-super-v-remapeia-bandeja-de-notificacoes.md) | Super+V é tirado da bandeja de notificações e devolvido no `disable()` | aceita |
| [0003](decisoes/0003-colar-via-teclado-virtual-do-clutter.md) | Colar com Ctrl+V de um teclado virtual do Clutter | aceita |
| [0004](decisoes/0004-persistencia-json-mais-pngs.md) | Persistência em JSON + PNGs por hash | aceita |
| [0005](decisoes/0005-limite-de-25-itens-e-fixados-fora-do-limite.md) | Limite de 25 itens; fixados fora do limite | aceita |

Novo ADR: copie o formato de um existente (contexto, decisão, consequências), numere em sequência
e adicione nesta tabela.

## Convenções

- Diagramas em Mermaid, dentro do Markdown, revisados junto com o código que descrevem.
- Português do Brasil no texto; nomes de código em inglês.
- Esta pasta é a fonte da verdade. O espaço **Transfer History** no Daily Stasis é um espelho.
