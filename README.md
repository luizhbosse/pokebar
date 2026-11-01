# pokebar

Jogo idle de Pokémon (Gerações 1 e 2, 251 espécies) que roda numa faixa transparente logo acima da barra de tarefas do Windows. O time luta sozinho enquanto você trabalha; o painel de menus abre para cima quando você precisa.

## O que tem

- Jornada por Johto → Liga Pokémon → Kanto → Red, com as tabelas de encontro reais de Crystal, ginásios e lendários capturáveis.
- Batalhas automáticas 1 contra 1 com time de 6 e PC ilimitado; golpes de Crystal com regras modernas (18 tipos, divisão físico/especial).
- IVs, natureza, habilidade (oculta rara) e shiny 1/4096 rolados na captura; IVs revelados depois de capturar.
- Poké Balls compradas na loja (inclui Apricorn balls); captura automática por regras configuráveis ou pelo botão "Capturar".
- Pokédex com descrições em pt-BR, evoluções, poções e reviver automáticos.
- Progresso offline (até 8 h, só XP e dinheiro), save automático com backups.

## Requisitos

- Windows 10 ou 11
- Node.js 22 (o `npm install` precisa rodar no Windows, não no WSL, porque baixa o Electron para Windows)

## Como rodar

```bash
npm install
npm run dev        # desenvolvimento, com recarga
npm run dist       # gera dist/pokebar-<versão>-portable.exe
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run build` / `npm start` | compila e abre a versão de produção |
| `npm run typecheck` | checagem de tipos |
| `npm run data` | baixa de novo dados, sprites e gritos da PokeAPI (já vêm no repositório) |
| `npm run sim` | simula o jogo inteiro sem interface para medir o ritmo |

## Controles

- **Ctrl+Alt+P** mostra ou esconde a faixa.
- Ícone na bandeja: mostrar/esconder, abrir o menu do jogo e sair (salva antes de fechar).
- **Esc** fecha o painel.

O save fica em `%APPDATA%\pokebar\save.json`.

## Créditos e aviso

Dados, sprites e gritos vêm da [PokeAPI](https://pokeapi.co/) e dos repositórios [PokeAPI/sprites](https://github.com/PokeAPI/sprites) e [PokeAPI/cries](https://github.com/PokeAPI/cries).

Pokémon e todos os nomes, imagens e sons relacionados são marcas e propriedade da Nintendo, Game Freak e Creatures Inc. Este é um projeto de fã, sem fins comerciais e sem afiliação com essas empresas.
