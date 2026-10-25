PAPEL
Você é um(a) Product Designer sênior especializado em software para iniciantes em fabricação digital (referências: Bambu Studio, Glowforge, Cricut Design Space, Linear, Teenage Engineering). Vai desenhar uma interface nova para o gSender, um programa open source que controla fresadoras CNC (máquinas que esculpem madeira, MDF, acrílico e alumínio a partir de arquivos G-code).

OBJETIVO
Desenhar uma interface minimalista, bonita e diferente de tudo no mercado de CNC. Uma pessoa sem experiência precisa ir do zero ao primeiro corte em menos de 10 minutos, sem atrapalhar o usuário avançado. A grande novidade é um assistente de IA que cria modelos 3D a partir de um texto ("uma placa com o nome Casa da Ana em relevo") e os prepara para cortar.

Entregue design e protótipo navegável com dados simulados. Não precisa conectar a uma máquina real.

---

O QUE O GSENDER FAZ HOJE (nenhuma função pode se perder; pode ser reorganizada ou escondida)

Navegação atual: barra lateral com 4 itens.
1. Carve (tela principal): barra superior com conexão, estado da máquina, ícones de status e spindle/laser. Visualizador 3D do percurso da fresa. Coluna com posição atual dos eixos (X, Y, Z), botões de zerar e "ir para". Área com controle de arquivo, controle do job e abas: Jog (mover a máquina), Probe (medir altura com placa de toque), Macros, Spindle, Coolant, Rotary (4º eixo), Console e troca automática de ferramenta. Barra de macros no modo retrato.
2. Tools: 8 ferramentas (Surfacing para aplainar a mesa, Rotary Surfacing, Movement Tuning para calibrar eixos, XY Squaring para alinhar, atalhos de teclado, Gamepad, gerenciador de cartão SD, instalação de acessórios).
3. Stats: visão geral, alarmes, histórico de jobs, manutenção, sobre.
4. Config: 16 seções e cerca de 155 campos (Basics, Customize UI, Motors, Probe, Action Buttons, Homing/Limits, Spindle/Laser, Accessory Outputs, Rotary, Automations, Tool Changing, Ethernet, Status Lights, Advanced Motors, More Settings, Accessibility).

Assistentes passo a passo existentes: troca de ferramenta manual, semiautomática e automática; primeira troca de ferramenta; medir comprimento da ferramenta.

Outras funções: arquivos recentes, pasta monitorada, editor de G-code, overrides ao vivo (velocidade de avanço, rotação do spindle, movimentos rápidos), pausar/retomar, modo laser, modo remoto pelo celular/tablet, notificações e alertas de manutenção, modal de fim de job.

JORNADA ATUAL DE UM CORTE
1. Conectar (escolher porta USB ou IP)
2. Destravar alarme e encontrar o zero da máquina (homing)
3. Carregar arquivo G-code feito em outro programa
4. Mover a fresa até o material e definir o ponto zero (manual ou com probe)
5. Conferir (contorno, limites, tempo estimado)
6. Rodar, ajustando velocidades e trocando ferramentas quando pedido
7. Finalizar e ver o resumo

PROBLEMAS QUE A NOVA INTERFACE PRECISA RESOLVER
1. A tela principal mostra tudo de uma vez: posição, jog, probe, macros, spindle, coolant, rotary e console.
2. A configuração tem cerca de 155 campos sem separar o que é seguro do que é perigoso.
3. A ordem conectar → zerar → cortar fica implícita; o usuário precisa saber de cor.
4. Muito jargão: GRBL, $-settings, MDI, WCS, override, homing.
5. O programa não cria nada; quem quer cortar precisa de outro software para gerar o arquivo.
6. Os alarmes aparecem como código numérico, sem dizer o que fazer.

---

PRINCÍPIOS DE UX (obrigatórios)
- Fluxo linear com 4 etapas fixas e sempre visíveis: Criar → Preparar → Posicionar → Cortar. Cada etapa tem um único botão primário. Usuários avançados podem pular etapas.
- Revelação progressiva: modo Simples por padrão; modo Pro mostra posição detalhada, console, comandos manuais, macros e overrides finos. Nada é removido, só escondido.
- Linguagem humana: "Encontrar o zero da máquina" em vez de "Homing"; "Altura da ferramenta" em vez de "Z0". O termo técnico aparece menor, para quem quer aprender.
- Prevenção antes de correção: checklist automático antes de cortar (arquivo cabe na mesa, fresa definida, zero definido, spindle ok), com ✓ ou ⚠ e correção a um clique.
- Alarmes viram instruções: o que aconteceu (uma frase), por que importa e um botão "Resolver" com passo a passo. O código fica num detalhe expansível.
- Feedback físico constante: mini-visualização 3D com a posição real da fresa sempre visível. Estado da máquina num único "pill" com cor + ícone + texto (nunca só cor).
- Segurança: botão Parar sempre visível, grande, na mesma posição, com atalho Espaço/Esc. Confirmações descrevem o resultado ("A fresa vai descer 5 mm"), nunca "Tem certeza?".
- Heurísticas de Nielsen, WCAG 2.2 AA, alvos de toque ≥ 44 px, navegação por teclado, foco visível, tema claro e escuro, respeito a prefers-reduced-motion.
- Mesmo design em desktop, tablet e celular.

ARQUITETURA DE INFORMAÇÃO
- Topo fixo: logo · Criar · Preparar · Posicionar · Cortar · pill de status da máquina · botão Parar
- Centro: viewport 3D ocupando cerca de 70% da tela (é o palco)
- Direita: um painel contextual com só o que a etapa atual precisa
- Sempre disponível: barra do assistente de IA (atalho ⌘K)
- Menu secundário: Biblioteca (projetos, fresas, materiais) · Máquina (configuração) · Histórico · Ferramentas

AS 4 ETAPAS
1. Criar: prompt de IA, importar arquivo (STL, SVG, DXF, G-code) ou escolher modelo da galeria.
2. Preparar: material, tamanho do bloco, fresa (biblioteca visual) e estratégia com presets "Rápido / Equilibrado / Detalhado". Tempo estimado e prévia animada do percurso.
3. Posicionar: conectar (detecção automática), encontrar o zero da máquina e definir a origem com jog visual (arrastar na prévia 3D ou D-pad grande com passos 0.1 / 1 / 10 mm). Probe guiado com ilustrações.
4. Cortar: checklist pré-voo → Iniciar. Durante o job: progresso, tempo restante, fresa em tempo real, Pausar/Parar, sliders simples de velocidade com limites seguros. No fim: resumo e "Cortar de novo".

CONFIGURAÇÃO
Organizada por intenção, não por parâmetro: Minha máquina, Ferramentas, Conexão, Segurança, Acessibilidade, Avançado. Assistente de primeira configuração com perfis prontos (Sienci LongMill, AltMill, Shapeoko, genérico). Parâmetros de firmware só em Avançado, com aviso, valor padrão e botão restaurar. As 8 ferramentas atuais (Surfacing, Squaring etc.) viram assistentes acessíveis pelo menu Ferramentas.

ASSISTENTE DE IA (desenhe todas estas telas e estados)
- Barra de prompt fixa, estilo conversa curta, com prompts de exemplo e histórico.
- Estado "gerando": animação elegante, sem spinner genérico.
- A IA responde com 3 variações em miniatura 3D; o usuário escolhe uma e refina conversando ("letras mais grossas", "adicione uma folha no canto").
- Parâmetros editáveis como chips e sliders (largura, profundidade, fonte, raio da borda) que atualizam o modelo na hora.
- Aviso de fabricabilidade em linguagem simples: "Esse detalhe é menor que a fresa de 3 mm. Vou engrossar para 3.2 mm. Ok?"
- Sugestão automática de material, fresa e profundidade, que preenche a etapa Preparar.
- Modo relevo para pedidos artísticos ("um leão em relevo"), mostrando a peça como relevo esculpido.
- Galeria com "remix" de projetos.
- Regra visual clara: a IA só cria arquivos; iniciar o corte é sempre uma ação explícita do usuário.

DIREÇÃO VISUAL — "Calm Precision"
Fuja do painel industrial cinza cheio de botões. A referência é um instrumento de precisão sereno.
- Palco escuro, interface leve: viewport 3D com luz de estúdio suave, sombra de contato e material com textura real (veios de madeira, acrílico translúcido). Painéis flutuantes de vidro sutil (blur 20 px, borda 1 px a 8% de opacidade).
- Paleta: grafite #111214, superfície #1A1B1E, papel #F5F3EF no tema claro. Um único acento, laranja-sinal #FF5B1F, só para a ação primária e para a fresa. Estados: Pronto verde-menta, Rodando azul-elétrico, Pausado âmbar, Alarme vermelho, sempre com ícone + texto.
- Tipografia: Inter Tight ou Geist na interface; mono tabular (Geist Mono ou JetBrains Mono) para coordenadas e números. Escala 12/14/16/20/28/40.
- Grid de 8 pt, raio 14 px nos painéis e 10 px nos controles, muito espaço livre, no máximo uma ação primária por tela.
- Movimento: transições de 180–240 ms com ease-out, câmera 3D que voa suavemente entre etapas, botões de jog que afundam ao toque.
- Ícones Lucide com traço de 1.5 px; ilustrações de passo a passo em linha fina, monocromáticas com o acento.
- Detalhes de assinatura: o pill de status pulsa devagar durante o corte, como respiração; a coordenada da fresa aparece como etiqueta presa à ponta da ferramenta no 3D; a barra de etapas se preenche como um percurso sendo cortado; ao terminar, a câmera dá uma volta de 360° na peça pronta.

ENTREGÁVEIS
1. Mapa de fluxo das 4 etapas, do onboarding (primeira conexão e perfil da máquina) e dos estados de erro e alarme.
2. Telas em alta fidelidade, desktop (1440×900) e celular, para: onboarding; Criar (vazio, gerando, 3 variações, refinando); Preparar; Posicionar (conectar, zero da máquina, jog, probe); Cortar (checklist, rodando, pausado, alarme com resolução guiada, concluído); Configuração (Simples e Avançado); menu Ferramentas; Histórico.
3. Modo Simples vs. modo Pro na tela de Cortar, lado a lado.
4. Tema claro e escuro de pelo menos uma tela.
5. Design system: tokens (cor, tipografia, espaçamento, raio, sombra, movimento) e componentes (Button, IconButton, Segmented, Slider, Stepper, Panel, Toast, Dialog, StatusPill, JogPad, CoordinateReadout, PromptBar, ModelCard, ChecklistItem, AlarmCard).
6. Protótipo navegável com dados simulados cobrindo o caminho completo: prompt → modelo → preparar → posicionar → cortar → concluído.
7. Microcopy em português do Brasil, incluindo 5 alarmes comuns reescritos como instruções (ex.: limite de curso atingido, probe falhou, parada de emergência, perda de posição, porta aberta).

CRITÉRIOS DE ACEITE
- Uma pessoa leiga entende o que fazer em cada tela sem ler documentação.
- No modo Simples, cada tela tem no máximo uma ação primária e no máximo 7 controles visíveis.
- O botão Parar está visível em todas as telas de máquina conectada.
- Todo alarme tem explicação humana e resolução guiada.
- Contraste AA em textos e estados; nenhum estado comunicado só por cor.
- Todas as funções listadas em "O que o gSender faz hoje" têm um lugar no novo design.

Comece pelo mapa de fluxo e pelos wireframes das 4 etapas. Mostre-os antes de partir para alta fidelidade.
