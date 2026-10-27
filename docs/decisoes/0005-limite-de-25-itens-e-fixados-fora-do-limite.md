# ADR-0005 — Limite de 25 itens; fixados fora do limite

- **Status:** aceita
- **Data:** 2026-10-27

## Contexto

O Windows 10 guarda os 25 itens mais recentes. Itens fixados não são descartados pelo limite nem
por “Limpar tudo”.

## Decisão

- `max-items` (padrão 25, ajustável de 5 a 200) conta só itens **não fixados**.
- Ao inserir, se passar do limite, saem os não fixados mais antigos.
- Copiar algo já presente (mesmo SHA-256) move o item para o topo, sem duplicar.
- “Limpar tudo” remove apenas os não fixados.
- Fixar não muda a posição do item na lista.

## Consequências

- Comportamento igual ao do Windows, que é o que o usuário espera.
- Fixados ilimitados: em tese a lista cresce sem teto; na prática, fixar é deliberado.
- O dedupe por hash faz “colar pelo painel” apenas reordenar a lista (ver ADR-0003).
