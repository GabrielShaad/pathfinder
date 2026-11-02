<p align="center"><img src=".claude-plugin/icon.png" width="96" alt="Pathfinder"></p>

# Pathfinder

O Pathfinder é um assistente de busca de emprego que roda dentro do Claude. Com ele você:

- **conversa** com o assistente sobre seu currículo atual, sua experiência e o tipo de vaga que você procura;
- **recebe um currículo novo**, preparado para os sistemas de recrutamento (ATS), em PDF e Word, e também em inglês se você quiser vagas no exterior;
- **busca vagas sempre que pedir**: no Brasil (Gupy e sites de carreira das empresas) e remotas no exterior que aceitam quem mora no Brasil;
- **recebe as melhores vagas** numa lista em PDF, numa planilha para acompanhar suas candidaturas e com cartas de apresentação prontas.

Tudo fica no seu computador. **O Pathfinder nunca se candidata por você**: ele prepara, e você decide e envia.

Serve para qualquer área: marketing, tecnologia, vendas, atendimento, finanças, RH, design, educação, saúde e outras.

---

## Do que você precisa

1. **Uma assinatura do Claude**: Pro, Max ou superior.
2. **O app do Claude para computador**, baixado em [claude.com/download](https://claude.com/download), aberto com a sua conta. Se você já usa o Claude Code no terminal, também serve: veja [Instalação pelo terminal](#instalação-pelo-terminal).

Não precisa instalar mais nada. Na primeira vez, o próprio Pathfinder baixa o componente de que precisa e pede sua permissão antes.

> **Importante:** o Pathfinder funciona na aba **Code** do app (é o "Claude Code", a parte do Claude que consegue criar arquivos no seu computador). No chat comum e no Cowork ele não consegue gerar os arquivos.

## Instalação no app do Claude (uma vez só, sem terminal)

São dois momentos: adicionar o Pathfinder à sua conta e abri-lo na aba Code.

### Parte 1: adicionar o Pathfinder à sua conta

1. Abra o app do Claude e entre em **Customize**, o menu dos seus conectores, habilidades e plugins (no app em português pode aparecer como **Personalizar**). Atalho: abra [claude.ai/customize/plugins](https://claude.ai/customize/plugins), no app ou no navegador.
2. Vá na seção **Plugins**.
3. Clique em **Add** (Adicionar) e escolha **Add marketplace** (Adicionar marketplace).
4. Na caixa do endereço, digite exatamente:
   ```
   GabrielShaad/pathfinder
   ```
   e confirme.
5. O **Pathfinder** aparece na lista de plugins. Abra-o e clique em **Add** (Adicionar).

O plugin agora está salvo na sua conta, e a própria Anthropic diz que ele vale também no Claude Code, inclusive na aba Code do app, sem instalar de novo.

### Parte 2: abrir o Pathfinder na aba Code

1. No app do Claude, clique na aba **Code**.
2. Comece uma **sessão local**, no seu computador e não na nuvem. Quando o app pedir uma pasta, escolha **Documentos** (pode ser qualquer pasta; o Pathfinder sempre guarda seus arquivos em Documentos/Pathfinder).
3. Para conferir se deu certo, digite **/** na caixa de mensagem e procure **pathfinder**: devem aparecer opções como `pathfinder:comecar`.
   - Se não aparecer, feche essa sessão e abra **uma sessão nova**. O plugin é baixado quando a sessão começa, e às vezes a primeira só faz o download.
4. Escreva **começar** e siga as instruções.

> O Pathfinder vem de um repositório público no GitHub e não passa pela revisão do diretório oficial da Anthropic. A Anthropic recomenda adicionar só plugins de fontes em que você confia. O código do Pathfinder é aberto e pode ser conferido neste repositório.

## Instalação pelo terminal

Para quem já usa o Claude Code no terminal (Mac, Windows ou Linux). Abra o terminal, digite `claude` e, dentro do Claude, rode:

```
/plugin marketplace add GabrielShaad/pathfinder
/plugin install pathfinder@pathfinder
```

Na tela de instalação, escolha **Install for you (user scope)**. Se o Claude pedir, rode `/reload-plugins`, ou feche e abra o Claude.

Um plugin instalado pelo terminal também aparece na aba Code do app no mesmo computador. Os comandos `/plugin ...` só funcionam no terminal; no app, use o caminho da seção anterior.

## Como usar

Escreva normalmente. Não precisa decorar comandos.

| Você escreve | O Pathfinder faz |
|---|---|
| **começar** | prepara o computador na primeira vez, conversa com você e gera seu currículo |
| **buscar vagas** | busca, avalia e lista as vagas, escreve as cartas e atualiza a planilha |
| **atualizar meu currículo** | adiciona ou corrige experiências e gera o currículo de novo |
| **apliquei na vaga 2** / **tenho entrevista na Acme** | atualiza a planilha de acompanhamento |

Os mesmos atalhos também existem como comandos: `/pathfinder:comecar`, `/pathfinder:buscar-vagas`, `/pathfinder:curriculo` e `/pathfinder:preparar`.

### Na primeira vez
O Pathfinder pede para instalar um componente gratuito, o Node.js, que gera os PDFs e busca as vagas:
- ele fica numa pasta só do Pathfinder;
- não pede senha e não muda nada no resto do computador;
- quando aparecer o pedido de permissão, clique em **Permitir** (ou **Yes**/**Allow**);
- depois é preciso reconectar uma vez:
  - **no app**, abra uma **sessão nova** na aba Code e escreva **começar** de novo. O Pathfinder continua de onde parou;
  - **no terminal**, digite `/mcp`, escolha **pathfinder** e depois **Reconnect**.

### A entrevista (uns 15 minutos)
Envie seu currículo atual:
- no app, clique em **+** ao lado da caixa de mensagem e anexe o arquivo, ou arraste o arquivo para a caixa;
- no terminal, arraste o arquivo para a janela;
- ou cole o texto.

Também pode ser o PDF do seu perfil do LinkedIn: no LinkedIn, abra seu perfil e escolha **Mais → Salvar em PDF**.

Depois o Pathfinder pergunta que cargo você busca, onde quer trabalhar (Brasil, exterior ou os dois), o modelo de trabalho e seu nível de inglês. Para fortalecer o currículo ele olha vagas reais e pergunta quais das ferramentas e conhecimentos que elas pedem você realmente tem. **Ele só coloca no currículo o que você confirmou.**

## Onde ficam seus arquivos

Numa pasta **Pathfinder** dentro de **Documentos**:

```
Pathfinder/
  Meu currículo/   Curriculo - Seu Nome.pdf e .docx   (e Resume - ... em inglês)
  Vagas/           Vagas AAAA-MM-DD.pdf               (a lista de cada busca)
                   Acompanhamento de vagas.xlsx      (sua planilha)
                   Cartas/                           (cartas de apresentação em PDF e Word)
  dados/           o que o Pathfinder sabe sobre você (não precisa abrir)
```

Na planilha, escolha o **Status** de cada vaga (Aplicada, Entrevista, Proposta...) e escreva o que quiser em **Anotações**. Na busca seguinte o Pathfinder mantém o que você marcou. **Feche a planilha antes de pedir uma nova busca.**

## Privacidade

- Seus dados (perfil, currículo, vagas) ficam **só no seu computador**, na pasta acima.
- A conversa com o Claude segue as regras de privacidade da sua conta Claude, como qualquer conversa.
- Para buscar vagas, o Pathfinder envia aos sites de vagas **apenas os termos de busca**, como "Analista de Marketing". Nunca envia seu nome, e-mail ou currículo.
- O Pathfinder **não se candidata** e não envia mensagens por você.
- O Pathfinder **não acessa** LinkedIn nem Indeed, que proíbem robôs. O PDF do LinkedIn é você quem baixa.

## De onde vêm as vagas

Só de fontes públicas e gratuitas:
- **Gupy**, pelo portal público de vagas;
- **Himalayas**, **Jobicy**, **We Work Remotely**, **Remotive** e **Remote OK**;
- as páginas de vagas das próprias empresas (Greenhouse, Lever, Ashby, SmartRecruiters, Workable e Recruitee).

Cada vaga da lista traz o link da página original. Os créditos e as condições de uso de cada fonte são respeitados.

## Problemas comuns

- **Digitei "/" na aba Code e não aparece "pathfinder":**
  1. Confira em **Customize → Plugins** se o Pathfinder está na lista e ligado.
  2. Feche a sessão e abra uma **sessão local nova** na aba Code. O plugin é baixado no início da sessão.
  3. Confira se o app está aberto com a **mesma conta** em que você adicionou o plugin.
- **O Pathfinder respondeu no chat comum ou no Cowork dizendo para usar a aba Code:** é isso mesmo. Os arquivos (currículo, lista, planilha) só são criados na aba **Code**.
- **"As ferramentas do Pathfinder não aparecem" ou "o Pathfinder não está funcionando":** na aba Code, escreva **preparar o Pathfinder**. Ele confere e instala o que faltar.
- **O download do componente falhou** (internet da empresa, antivírus): o Pathfinder oferece um plano B, que é instalar pelo site oficial nodejs.org e avisá-lo.
- **A planilha não atualizou:** ela provavelmente estava aberta. O Pathfinder salva uma cópia "(atualizado ...)". Feche a planilha e peça uma nova busca.
- **Atualizar o Pathfinder:**
  - **App:** em **Customize → Plugins**, use **Check for updates** (Verificar atualizações) no marketplace do Pathfinder, ou ligue **Sync automatically** para receber as versões novas sozinho.
  - **Terminal:** rode `/plugin marketplace update pathfinder`. Para atualizar sempre sozinho, ligue **Enable auto-update** em `/plugin` → **Marketplaces**.
- **Desinstalar:**
  - **App:** em **Customize → Plugins**, abra o Pathfinder, clique no menu dele e escolha **Remove** (Remover). Para só pausar, desligue a chave **Disable plugin**.
  - **Terminal:** rode `/plugin uninstall pathfinder@pathfinder`.
  - Nos dois casos, sua pasta em Documentos continua lá.
- **Mudar a pasta** (avançado): defina a variável de ambiente `PATHFINDER_HOME` com o caminho desejado antes de abrir o Claude.

---

## For maintainers

Claude Code plugin = skills (`skills/`) + subagents (`agents/`) + a bundled MCP server (`dist/server.mjs`, built from `src/`) running on a private Node.js runtime that `scripts/install-node.{sh,ps1}` places in `${CLAUDE_PLUGIN_DATA}/node`. Decisions are in [`docs/adr`](docs/adr). Derived from the private Horizon project.

```bash
pnpm install
pnpm check            # typecheck + tests + build
pnpm tsx scripts/dev-search.ts both marketing "Analista de Marketing;Marketing Analyst"   # live search
claude --plugin-dir .  # try the plugin locally
```

Release:
1. Bump `version` in `package.json` and `.claude-plugin/plugin.json`.
2. Run `pnpm build` and commit `dist/` (CI fails if it is stale).
3. Tag `vX.Y.Z`.

License: MIT (see `LICENSE`). Inter font: SIL OFL 1.1 (`assets/fonts/OFL.txt`). Third-party notices of the bundle: `dist/server.mjs.LEGAL.txt`.
