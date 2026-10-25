# Prompt — Nova UI/UX para o gSender com assistente de IA 3D

> Copie tudo abaixo da linha e cole no seu agente (Claude Code, Lovable, v0, Cursor…). O prompt é autocontido e se apoia no [relatório de engenharia reversa](./01-relatorio-engenharia-reversa.md).

---

## PAPEL

Você é um(a) Product Designer sênior e engenheiro(a) front-end. Já desenhou softwares industriais para iniciantes (estilo Bambu Studio, Glowforge, Cricut Design Space) e conhece bem o ecossistema CNC (GRBL, grblHAL, G-code, CAM). Vai projetar e implementar uma **interface nova** para o gSender, um sender de G-code open source para fresadoras CNC.

## OBJETIVO

Criar uma interface **minimalista, bonita e diferente de tudo no mercado de CNC**, que uma pessoa sem experiência consiga usar do zero ao primeiro corte em menos de 10 minutos. Ao mesmo tempo, ela não pode atrapalhar o usuário avançado. A grande novidade é um **assistente de IA que cria modelos 3D a partir de prompts** e os transforma em G-code pronto para cortar.

## CONTEXTO TÉCNICO (vem da engenharia reversa; não reinvente)

- O gSender tem um **servidor Node embutido**, separado da UI:
  - REST em `/api/*`: `gcode`, `file`, `macros`, `state`, `preferences`, `machines`, `maintenance`, `jobstats`, `alarmList`, `remote`, `version`
  - **Socket.IO** para tempo real
- Comandos principais via `controller.command(...)`: `gcode`, `gcode:start|pause|resume|stop`, `gcode:safe`, `homing`, `unlock`, `reset`, `jog:cancel`, `feedOverride`, `spindleOverride`, `rapidOverride`, `macro:run`, `toolchange:*`, `sdcard:*`
- Eventos: `serialport:list`, `serialport:openController`, `networkScan`, `file:load`
- O estado da máquina (posição, status Idle/Run/Hold/Alarm, alarmes, overrides) chega por socket. Hoje ele é guardado em Redux nos slices `controller`, `connection`, `fileInfo` e `visualizer`.
- **A nova UI substitui só o renderer.** Ela se conecta ao mesmo servidor, como o Remote Mode já faz pelo navegador. Não mexa em `server/controllers` nem em `cncengine`.
- Stack sugerida: React 18 + TypeScript + Vite, Tailwind, Radix UI (primitivos acessíveis), Zustand ou Redux Toolkit, Three.js / React Three Fiber para 3D, Framer Motion para movimento.
- Segurança Electron: `contextIsolation: true`, `nodeIntegration: false` e uma ponte `contextBridge` com uma lista fechada de funções. A versão atual expõe `fs` no `window`; não repita isso.

## PROBLEMAS DA UI ATUAL QUE VOCÊ PRECISA RESOLVER

1. A tela principal mostra tudo de uma vez: DRO, jog, probe, macros, spindle, coolant, rotary e console.
2. A Config tem 16 seções e ~155 campos sem separar "seguro" de "perigoso".
3. A sequência conectar → home → zerar → rodar fica implícita; o usuário precisa saber de cor.
4. Muito jargão: GRBL, $-settings, MDI, WCS, override.
5. O app não cria nada; quem quer cortar algo precisa de um CAM externo.
6. Os alarmes aparecem como código, sem dizer o que fazer.

## PRINCÍPIOS DE UX (obrigatórios)

- **Um fluxo linear com 4 etapas fixas, sempre visível:** `Criar → Preparar → Posicionar → Cortar`. Cada etapa tem um único botão primário. A próxima etapa só destrava quando a anterior está pronta, mas um usuário avançado pode pular etapas.
- **Revelação progressiva.** O modo Simples é o padrão. O modo Pro (atalho ou toggle) mostra DRO completo, console, MDI, macros e overrides finos. Nada é removido, só escondido.
- **Linguagem humana.** Escreva "Encontrar o zero da máquina", não "Homing". Escreva "Altura da ferramenta", não "Z0 / TLO". O termo técnico aparece em texto menor para quem quer aprender.
- **Prevenção antes de correção.** Antes de cortar, rode um checklist automático: arquivo cabe na mesa, fresa definida, zero definido, spindle ok. Mostre ✓ ou ⚠ com a correção a um clique.
- **Alarmes viram instruções:** o que aconteceu (1 frase), por que importa e um botão "Resolver" que guia passo a passo. O código do alarme fica num detalhe expansível.
- **Feedback físico constante.** Uma mini-visualização 3D da máquina com a posição real da fresa, sempre visível. O estado da máquina usa cor e forma (nunca só cor) e aparece num único "pill" de status.
- **Segurança em primeiro lugar.** O botão de **Parar** fica sempre visível, grande, na mesma posição, com atalho `Espaço`/`Esc`. Ações perigosas pedem confirmação com o resultado descrito ("A fresa vai descer 5 mm"), nunca um "Tem certeza?" genérico.
- **Heurísticas de Nielsen, WCAG 2.2 AA, alvos de toque ≥ 44 px.** Navegação completa por teclado, suporte a leitor de tela (anúncios de progresso do job), `prefers-reduced-motion`, tema claro/escuro.
- **Funciona em desktop, tablet e celular** (Remote Mode), com o mesmo design.

## ARQUITETURA DE INFORMAÇÃO

```
Topo fixo:  [logo]  Criar · Preparar · Posicionar · Cortar   [status da máquina ●]  [Parar ■]
Canvas:     viewport 3D ocupando ~70% da tela (é o "palco")
Painel:     um painel contextual à direita, com só o que a etapa atual precisa
Dock:       assistente de IA (⌘K / barra de prompt) disponível em qualquer etapa
Escondido:  Biblioteca (projetos, fresas, materiais) · Máquina (config) · Histórico
```

### Etapas

1. **Criar.** Prompt de IA, importar arquivo (STL, SVG, DXF, G-code) ou escolher um modelo da galeria.
2. **Preparar.** Material (madeira, MDF, acrílico, alumínio), tamanho do bloco, fresa (biblioteca visual) e estratégia (desbaste + acabamento) com presets "Rápido / Equilibrado / Detalhado". Mostre tempo estimado e prévia do toolpath animada.
3. **Posicionar.** Conectar (detecção automática da porta), encontrar o zero da máquina e definir o ponto de origem com jog visual: arrastar na prévia 3D ou usar um joystick/D-pad grande com passos 0.1 / 1 / 10 mm. Probe guiado com ilustrações.
4. **Cortar.** Checklist pré-voo, depois Iniciar. Durante o job: barra de progresso, tempo restante, linha atual, prévia da fresa em tempo real, Pausar/Parar e sliders simples de velocidade (overrides) com limites seguros. No fim: resumo, foto (se houver câmera) e "Cortar de novo".

### Configuração (Máquina)

Organize por **intenção**, não por parâmetro: "Minha máquina", "Ferramentas", "Conexão", "Segurança", "Acessibilidade", "Avançado". Use um assistente de primeira configuração com perfis prontos (Sienci LongMill, AltMill, Shapeoko, genérico GRBL). Campos de firmware (`$`) ficam só em Avançado, com aviso, valor padrão e "restaurar".

## ASSISTENTE DE IA — CRIAÇÃO DE MODELOS 3D POR PROMPT

### Escopo inicial (v1): placas e letreiros 2D/2.5D

Implemente primeiro só este escopo. Ele cobre a maior parte do que um iniciante corta numa CNC de 3 eixos e evita o CAM 3D completo.

> **O motor de CAM desta v1 já existe:** a pasta `cam-engine/` (TypeScript, 35 testes passando) gera G-code GRBL verificado a partir do JSON abaixo. **Use esse pacote; não reescreva o CAM.** O trabalho da UI é chamar `generatePlate(spec, opções)`, mostrar `avisos`, desenhar a prévia a partir de `layout` e da simulação, e enviar o `gcode` quando `ok` for verdadeiro. Detalhes em `cam-engine/README.md`.

- **Tipos de peça:** placa com texto em relevo, gravado ou vazado; letreiro recortado (letras soltas ou palavra contínua); placa com borda (reta, arredondada, chanfrada) e ícones simples (coração, estrela, casa, folha); furos de fixação e rasgo para pendurar.
- **Bibliotecas (todas no navegador, sem servidor):**
  - **opentype.js** (MIT): texto → contornos vetoriais a partir de fontes TTF/OTF. Fontes incluídas: Archivo Black, Pacifico, Bebas Neue (SIL OFL).
  - **Clipper2 via `clipper2-ts`** (BSL-1.0): união e diferença das regiões e offsets da fresa (pocket por anéis, recorte por fora e por dentro, checagem de detalhes menores que a fresa). O pacote `clipper2-js` foi descartado: o offset negativo dele está quebrado.
  - **Zod** (MIT): valida o JSON que a IA preenche antes de qualquer cálculo.
  - **Three.js / React Three Fiber**: prévia 3D, alimentada pelo mapa de alturas da simulação do `cam-engine`.
  - Não usamos kernel CAD 3D (Replicad/OpenCascade/manifold) na v1.
- **Aproveitado do rudra496/cnc (MIT):** só ideias, nenhum arquivo copiado. A simulação de remoção de material por mapa de alturas (reescrita em `cam-engine/src/sim/heightmap.ts`, sem Three.js e com resolução de 0,25 mm) e a fórmula de avanço da calculadora (avanço por dente × canais × RPM, em `cam-engine/src/materials.ts`). Os presets de material dele (metais) não servem; usamos MDF, compensado, madeira macia/dura e acrílico.
- **Schema da IA:** a IA preenche um JSON fechado, sem código livre: `PlateSpecSchema` em `cam-engine/src/schema.ts` (`tipo`, `largura`, `altura`, `espessura`, `material`, `texto[]` com `conteudo/fonte/tamanho/modo/profundidade/x/y`, `borda`, `moldura`, `icones[]`, `furos[]`, `rasgos[]`, `recorteExterno`, `margem`). Use o próprio schema Zod como definição da ferramenta (tool use) da Claude API.
- **Operações de CAM (prontas):** gravação e relevo por pocket de anéis concêntricos, vazado (estêncil), furos (bicada ou pocket), rasgos, recorte externo com abas e troca entre duas fresas (`T# M6`). Fresas: reta e V-bit (a V-bit só grava seguindo o contorno). V-carve de profundidade variável e entrada em rampa ficam para a v1.1.
- **Saída e segurança:** G-code GRBL com cabeçalho (G21 G90 G17 G94), altura segura e passadas por material e fresa. O verificador relê o texto final e bloqueia `$`, G20/G91, G0 dentro do material, corte com spindle desligado, avanço acima do máximo e saída da área. Ele também deve rodar sobre G-code importado.
- **Avisos de fabricabilidade:** já saem com código estável e texto em pt-BR (`TEXTO_NAO_CABE` com tamanho sugerido, `DETALHE_MENOR_QUE_FRESA` com % não cortado, `ELEMENTO_NAO_USINAVEL`, `ILHAS_SOLTAS`…). A IA deve ler esses códigos e propor a correção ("vou reduzir o texto para 16 mm. Ok?").
- **Máquinas Sienci Labs:** o produto é feito para as máquinas da Sienci. Use o catálogo `cam-engine/src/catalog/sienci/` (máquinas LongMill MK2/MK3 e AltMill, cabeçotes Makita/AutoSpin/spindle, 15 fresas da loja com regra de compatibilidade, tabela oficial de avanço e rotação, 7 projetos de primeiros cortes). Passe `sienci: { maquina, cabecote, fresa, fresaRecorte, velocidade }` para `generatePlate`. Pré-selecione a máquina a partir do perfil já escolhido no gSender e mostre `ajustesManuais` (dial do Makita) no checklist antes de cortar.
- **Integração com o gSender:** confira os limites do catálogo com os parâmetros reais do firmware ($110–$112, $130–$132), porque o usuário pode ter alterado, e mande o G-code por `POST /api/gcode`.
- **Fora do escopo da v1:** relevo artístico (heightmap), malhas STL convertidas em toolpath 3D, caixas com encaixe, 4º eixo. Pedidos assim recebem resposta amigável com uma alternativa dentro do escopo (ex.: silhueta gravada). Importar G-code pronto continua funcionando.
- **Pronto quando:** "placa 20×10 cm, MDF 15 mm, 'Casa da Ana' em relevo de 3 mm, borda arredondada, 2 furos" gera um G-code que passa no verificador e é simulado corretamente no visualizador.

### Experiência

- Uma barra de prompt fixa, como uma conversa curta: "Uma placa de 20×10 cm com o nome *Casa da Ana* em relevo e borda arredondada".
- A IA responde com **3 variações** em miniatura 3D. O usuário escolhe uma e refina conversando ("letras mais grossas", "adicione uma folha no canto").
- Parâmetros editáveis aparecem como chips/sliders gerados pela IA (largura, profundidade, fonte, raio da borda). Mudar um slider atualiza o modelo na hora, sem nova chamada à IA.
- A IA sempre confere se o modelo pode ser fabricado e avisa em linguagem simples: "detalhe menor que a fresa de 3 mm, vou engrossar para 3.2 mm. Ok?"
- Ela também sugere material, fresa e profundidade, preenchendo a etapa Preparar.
- Prompts de exemplo, histórico e "remix" de projetos da galeria.

### Pipeline técnico (CNC exige geometria precisa, não malha "artística")

1. **LLM → especificação paramétrica.** A IA (Claude API, modelo mais recente com tool use) não gera malha nem código. Na v1 ela preenche o `PlateSpecSchema` do `cam-engine`, que vira geometria 2.5D com opentype.js + Clipper2. Para fases futuras (caixas, peças), avalie um kernel CAD no navegador (Replicad/OpenCascade.js ou manifold-3d).
2. **Relevos orgânicos (2.5D).** Para pedidos artísticos ("um leão em relevo"), gere uma imagem → mapa de profundidade (heightmap) → superfície 2.5D. É o tipo de modelo que uma fresa de 3 eixos corta bem.
3. **Text-to-3D por malha** (opcional, para importar STL) entra só como modo "experimental", com aviso de que a malha será convertida em 2.5D.
4. **Validação de fabricabilidade:** cabe no material/mesa; sem undercuts em 3 eixos; espessura mínima ≥ diâmetro da fresa; profundidade ≤ comprimento útil.
5. **CAM no navegador:** na v1 é o `cam-engine` (pocket, perfil com abas, furos → G-code GRBL). Rode-o num Web Worker e mostre a simulação de remoção de material. Desbaste 3D (waterline/raster) fica para os relevos artísticos, fora da v1.
6. **Envio:** `POST /api/gcode` e depois o fluxo normal (Posicionar → Cortar) pelo servidor do gSender.
7. **Guardrails:**
   - A IA **nunca envia comandos para a máquina.** Ela só produz arquivos. Toda execução exige uma ação explícita do usuário.
   - O G-code gerado passa por um verificador: limites da mesa, feeds máximos do perfil, sem `$` settings, sem comandos fora da lista permitida.

## DIREÇÃO VISUAL — "Calm Precision"

Fuja do visual "painel industrial cinza cheio de botões". A referência é um **instrumento de precisão sereno**: estúdio fotográfico, relógio suíço, Teenage Engineering, Linear, Arc.

- **Palco escuro, interface leve.** O viewport 3D é o centro, com iluminação de estúdio suave, sombra de contato e o material com textura real (veios de madeira, acrílico translúcido). A UI flutua em painéis de vidro sutil (blur 20 px, borda 1 px com 8% de opacidade).
- **Paleta:**
  - Neutros quentes: grafite `#111214`, superfície `#1A1B1E`, papel `#F5F3EF` no tema claro
  - **Um** acento vivo: laranja-sinal `#FF5B1F`, usado só para a ação primária e para a fresa
  - Estados: Pronto = verde-menta, Rodando = azul-elétrico, Pausado = âmbar, Alarme = vermelho, sempre com ícone + texto
- **Tipografia:** Inter Tight ou Geist para a UI, e **mono tabular** (Geist Mono / JetBrains Mono) para coordenadas e números, que nunca "pulam". Escala 12/14/16/20/28/40.
- **Grid de 8 pt**, raio 14 px nos painéis e 10 px nos controles, muito espaço em branco, no máximo 1 ação primária por tela.
- **Movimento com propósito:** transições de 180–240 ms com ease-out, câmera 3D que "voa" suavemente entre etapas, microinterações táteis no jog (o botão afunda e a posição desliza). Tudo respeita `prefers-reduced-motion`.
- **Ícones:** Lucide com traço de 1.5 px. Ilustrações de passo a passo em linha fina, monocromáticas com o acento.
- **Detalhes de assinatura (o "diferente"):**
  - O "pill" de status pulsa devagar enquanto corta, como uma respiração
  - A coordenada da fresa aparece como etiqueta flutuante presa à ponta da ferramenta no 3D
  - A barra de etapas no topo é uma linha contínua que "se preenche" como um toolpath sendo cortado
  - Ao terminar o job, a câmera faz uma volta de 360° na peça pronta

## ENTREGÁVEIS

1. **Fluxos e wireframes** das 4 etapas, do onboarding, da configuração e dos estados de erro e alarme (desktop + celular).
2. **Design system:** tokens (cor, tipo, espaçamento, raio, sombra, motion) em CSS variables / Tailwind config, e componentes Radix estilizados (Button, IconButton, Segmented, Slider, Stepper, Panel, Toast, Dialog, StatusPill, JogPad, CoordinateReadout, PromptBar, ModelCard).
3. **Protótipo funcional** em React + TS conectado ao servidor do gSender (REST + Socket.IO), com um **modo simulador** (máquina fake) para testar sem CNC.
4. **Módulo de IA:** PromptBar + chamada à Claude API com tool use → código paramétrico → render 3D → validação → CAM → G-code. Inclua o system prompt do assistente e os schemas JSON.
5. **Microcopy** completa em PT-BR e EN (i18n), incluindo todos os alarmes GRBL reescritos como instruções.
6. **Plano de testes de usabilidade:** 5 usuários leigos, tarefa "do prompt ao primeiro corte". Métricas: tempo, erros, SUS ≥ 80.

## CRITÉRIOS DE ACEITE

- [ ] Uma pessoa leiga faz "prompt → modelo → G-code → posicionar → cortar" sem ler documentação, em menos de 10 minutos.
- [ ] A tela inicial mostra no máximo 1 ação primária e no máximo 7 controles visíveis no modo Simples.
- [ ] O botão Parar fica sempre visível e responde por teclado em menos de 100 ms.
- [ ] Todo alarme tem explicação humana e um botão de resolução guiada.
- [ ] WCAG 2.2 AA (contraste, foco visível, teclado, leitor de tela) verificado com axe.
- [ ] A IA nunca executa movimento na máquina; todo G-code gerado passa pelo verificador.
- [ ] Funciona em 1280×800, 1920×1080, tablet e celular (Remote Mode).
- [ ] Nenhuma alteração no `server/` do gSender. A UI nova fala com ele só via REST e Socket.IO.

Comece pelos fluxos e pelo design system. Mostre os wireframes das 4 etapas e espere minha aprovação antes de implementar.
