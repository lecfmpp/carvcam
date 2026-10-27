PAPEL
Você é um(a) Product Designer sênior especializado em software para iniciantes em fabricação digital (referências: Bambu Studio, Glowforge, Cricut Design Space, Linear, Teenage Engineering). Vai desenhar uma interface nova para o gSender, um programa open source que controla fresadoras CNC (máquinas que esculpem madeira, MDF, acrílico e alumínio a partir de arquivos G-code).

OBJETIVO
Desenhar uma interface minimalista, bonita e diferente de tudo no mercado de CNC. Uma pessoa sem experiência precisa ir do zero ao primeiro corte em menos de 10 minutos, sem atrapalhar o usuário avançado. A grande novidade é um assistente de IA que cria modelos a partir de um texto ("uma placa com o nome Casa da Ana em relevo") e os prepara para cortar. Na primeira versão, ele cria placas e letreiros (veja "Escopo inicial").

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

ESCOPO INICIAL DO ASSISTENTE (v1): PLACAS E LETREIROS
Na primeira versão, a IA cria só placas e letreiros em 2D/2.5D. Todos os exemplos, prompts sugeridos, galeria e telas do assistente devem girar em torno disso:
- Placas com nome ou número (casa, porta, mesa, pet), em relevo (letras altas) ou gravadas (letras baixas)
- Letreiros recortados (letras soltas ou palavra contínua cortada do material)
- Placas com borda (reta, arredondada, chanfrada) e ícones simples (folha, coração, estrela, casa)
- Placas com furos de fixação ou rasgo para pendurar
- Parâmetros principais: largura, altura, espessura, texto, fonte, tamanho e profundidade das letras, tipo de borda, ícone, furos
- Materiais sugeridos: MDF, madeira maciça, compensado, acrílico
Fora do escopo da v1 (mostrar como "em breve" na galeria, sem telas próprias): relevos artísticos 3D, caixas com encaixe, peças mecânicas. Se o usuário pedir algo fora do escopo, a IA explica em uma frase e oferece uma alternativa dentro dele (ex.: "um leão em relevo" → "placa com silhueta de leão gravada").
Importar STL/SVG/DXF e G-code pronto continua disponível na etapa Criar.

ASSISTENTE DE IA (desenhe todas estas telas e estados)
- Barra de prompt fixa, estilo conversa curta, com prompts de exemplo e histórico.
- Estado "gerando": animação elegante, sem spinner genérico.
- A IA responde com 3 variações em miniatura 3D; o usuário escolhe uma e refina conversando ("letras mais grossas", "adicione uma folha no canto").
- Parâmetros editáveis como chips e sliders (largura, profundidade, fonte, raio da borda) que atualizam o modelo na hora.
- Aviso de fabricabilidade em linguagem simples: "Esse detalhe é menor que a fresa de 3 mm. Vou engrossar para 3.2 mm. Ok?"
- Sugestão automática de material, fresa e profundidade, que preenche a etapa Preparar.
- Estado "fora do escopo": resposta amigável com alternativa dentro de placas e letreiros.
- Galeria com "remix" de placas e letreiros prontos, e uma seção "em breve" para relevos e caixas.
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

---

MUDANÇAS APÓS O MOTOR DE CAM (atualize o design com isto)

O motor que transforma a placa em G-code já existe. Ele mudou algumas premissas do fluxo. Ajuste o design assim:

1. MATERIAL, ESPESSURA E FRESA SOBEM PARA A ETAPA CRIAR
Se uma peça pode ser cortada depende da fresa e do material: uma letra fina pode ser possível com fresa de 1/16" e impossível com 1/8"; uma profundidade de 3 mm não serve numa placa de 3 mm. Por isso:
- Mostre material, espessura e fresa como chips no topo do painel de Criar, já com padrões (MDF 15 mm, fresa reta 1/8"), editáveis ali mesmo.
- Trocar qualquer chip revalida o modelo na hora.

2. CRIAR VIRA CONVERSA + EDITOR DE PARÂMETROS
A IA não desenha livremente: ela preenche campos. O usuário refina conversando ou mexendo nos mesmos controles:
- Placa: largura, altura, borda (reta, arredondada, chanfrada) e raio, moldura
- Textos (até 6): conteúdo, fonte, tamanho da letra, modo (relevo, gravado, vazado), profundidade, posição (automática ou arrastando na prévia)
- Ícones: coração, estrela, casa, folha (tamanho, posição, modo)
- Furos e rasgo para pendurar
- Tipo: placa ou letreiro recortado
Fontes disponíveis: Archivo Black (grossa, a mais fácil de cortar), Pacifico (cursiva, letras ligadas) e Bebas Neue (condensada). O seletor de fonte é visual e indica qual é mais fácil de cortar.

3. AVISOS VIRAM UM COMPONENTE CENTRAL
Toda mudança devolve avisos em português, com sugestão. Desenhe dois níveis:
- Erro: bloqueia o botão "Continuar". Tem botão "Aplicar sugestão". Exemplos: "O texto não cabe na placa → reduzir para 18 mm"; "Os traços de 'desde 2024' são mais finos que a fresa de 3,17 mm → aumentar o texto ou usar fresa 1/16""; "O furo de 2 mm é menor que a fresa".
- Aviso: deixa seguir e destaca na prévia onde vai sobrar material. Exemplos: "Cerca de 4% da folha não será cortada"; "Os miolos do 'o' vão se soltar no vazado"; "Peças pequenas sem aba: prenda com fita dupla-face".
Desenhe também como a IA comenta esses avisos na conversa ("Vou reduzir o texto para 18 mm. Ok?").

4. A PRÉVIA MOSTRA O CORTE REAL
A prévia é a simulação do que a fresa vai fazer, não um modelo idealizado: fundo rebaixado, furos atravessando, abas de fixação, cantos internos arredondados pelo raio da fresa e áreas que a fresa não alcança. Desenhe:
- Vista de cima com legenda de profundidade (face intacta, rebaixado, atravessou)
- Vista 3D da peça simulada
- Destaque das áreas com aviso

5. PREPARAR FICA MAIS ENXUTO
Sobram:
- Preset de velocidade: Rápido / Equilibrado / Detalhado (mostra RPM e avanço só no modo Pro)
- Abas de fixação: quantidade e altura
- Segunda fresa opcional (ex.: gravar com 1/16", recortar com 1/8")
- Resumo: tempo estimado, lista de operações (rebaixo, furos, recorte), tamanho do bloco necessário e selo "G-code verificado ✓"

6. POSICIONAR: ZERO SEMPRE NO MESMO LUGAR
O zero do trabalho é o canto inferior esquerdo do bloco, na face de cima. Ilustre isso claramente. Mostre o tamanho mínimo do bloco (a placa mais 10 mm de margem de cada lado quando há recorte).

7. CORTAR: TROCA DE FRESA E ABAS
- Se o projeto usa duas fresas, o corte pausa no meio: desenhe a tela "Troque para a fresa 1/8"" com ilustração e botão "Pronto, continuar" (com novo zero de altura da fresa).
- No fim, um estado "Peça pronta: corte as abas e lixe as bordas" com ilustração.

8. NOVOS ESTADOS PARA O PROTÓTIPO
Inclua no protótipo navegável:
- Criar com erro bloqueando, depois "Aplicar sugestão" resolvendo
- Troca de fresa no meio do corte
- Letreiro recortado (tipo "letreiro") com letras cursivas ligadas

---

MÁQUINAS E FRESAS DA SIENCI LABS (atualize o design com isto)

A ferramenta passa a ser feita para as máquinas da Sienci Labs. Máquina, router/spindle e fresas reais entram no fluxo, com configurações padrão para cada máquina e projetos prontos para os primeiros cortes. O motor já tem esses dados; o design precisa mostrá-los.

Dados que a interface vai receber:
- Máquinas: LongMill MK2 (12×30, 30×30, 48×30), LongMill MK3 (30×30, 48×30), AltMill (2×4, 4×4, 4×8). Cada uma tem área útil real, velocidade máxima e os cabeçotes possíveis.
- Cabeçotes: Makita RT0701 (rotação no dial, à mão, posições 1 a 6), AutoSpin T1 (rotação automática pelo programa) e Spindle 1,5 kW / 2,2 kW (rotação automática).
- Fresas Sienci: retas 1/16″, 1/8″ e 1/4″ (upcut, downcut, 1 canal, compressão), V-bits de 30°, 60° e 90°, fresa de aplainar 22 mm e ball nose. Cada uma tem diâmetro, haste, comprimento de corte, indicação de uso e link da loja.
- Compatibilidade: cada fresa é "cabe", "precisa de acessório" (ex.: haste 1/8″ no Makita precisa da pinça de 1/8″) ou "não cabe".
- Velocidades: tabela oficial da Sienci (Reduzida, Regular, Máxima) por fresa e material.
- 7 projetos de primeiros cortes, cada um com nível, fresas, material, o que a pessoa aprende e em quais máquinas cabe.

1. ONBOARDING "MINHA OFICINA" (primeira vez que abre)
Três passos curtos, com ilustrações (não use logotipo nem fotos de produto sem autorização da Sienci):
- Qual é a sua máquina? Cards por família (LongMill MK2, LongMill MK3, AltMill), depois o tamanho. Mostre a área útil em cm. Se o gSender já tiver um perfil de máquina configurado, abra com ele sugerido ("Encontramos uma LongMill MK3 30×30. É essa?").
- O que gira a fresa? Makita RT0701, AutoSpin T1 ou Spindle, com o padrão da máquina já marcado (MK2 = Makita, MK3 = AutoSpin, AltMill = Spindle 2,2 kW).
- Quais fresas você tem? Grade de cards das fresas Sienci. Atalho "Tenho o Starter End Mill Set (Beginner's Kit)" marca as 5 fresas do kit de uma vez.
No fim: "Primeiro passo: aplainar a mesa" (abre a ferramenta Surfacing do gSender com a fresa de 22 mm).

2. CHIP DE MÁQUINA SEMPRE VISÍVEL
No topo, ao lado do status: "LongMill MK3 30×30 · AutoSpin". Tocar abre a troca de máquina (há quem tenha mais de uma). Trocar de máquina revalida o projeto na hora: área, fresas e velocidades.

3. A MESA REAL NO PALCO 3D
O viewport mostra a mesa no tamanho da área útil da máquina escolhida, com o bloco posicionado nela. Se a peça não couber, a parte que sai da área aparece em vermelho, e o aviso diz em qual máquina caberia.

4. BIBLIOTECA DE FRESAS (Minhas fresas + Loja Sienci)
- Card de fresa: silhueta desenhada do perfil (reta, V, bola, compressão), diâmetro em mm e polegadas, haste, comprimento de corte e uma frase de uso ("Relevo e gravação sem lascar a face de cima").
- Selos de compatibilidade com o cabeçote atual: "Cabe no seu AutoSpin ✓", "Precisa da pinça 1/8″ · ver na loja", "Não serve para placas (ainda)".
- Filtro por intenção: Gravar, Relevo, Recortar, Plástico, Aplainar.
- Duas abas: "Minhas fresas" (as que a pessoa marcou) e "Todas as fresas Sienci" (com botão "Ver na loja").

5. CRIAR E PREPARAR USAM AS FRESAS REAIS
- O chip de fresa em Criar só oferece fresas de "Minhas fresas" que cabem no cabeçote.
- Se a IA sugerir uma fresa que a pessoa não tem: "Para esse detalhe o ideal é a 1/16″ downcut, que você ainda não tem. Usar a 1/8″ (alguns detalhes somem) ou ver na loja?"
- Projetos com duas fresas mostram as duas, na ordem de uso.

6. VELOCIDADE = TABELA OFICIAL SIENCI
O preset de Preparar passa a ser a tabela da Sienci: Detalhado = Reduzida, Equilibrado = Regular, Rápido = Máxima. O padrão depende da máquina (LongMill = Equilibrado, AltMill = Rápido). Mostre a fonte com discrição: "Valores da tabela oficial Sienci Labs". No modo Pro, mostre RPM, avanço, mergulho e passada.

7. MAKITA: DIAL À MÃO
Com o Makita, a rotação não é automática. Desenhe:
- No checklist antes de cortar: ilustração do dial com a posição destacada ("Gire o dial para 3 · 17.000 RPM").
- Na troca de fresa no meio do corte: o novo valor do dial, se mudar.
Com AutoSpin ou Spindle, mostre apenas "Rotação automática ✓".

8. PRIMEIROS CORTES (galeria e trilha "Comece aqui")
Uma área "Primeiros cortes" na tela inicial e no estado vazio de Criar, com cards. Cada card tem:
- Prévia da simulação
- Nível (Primeiro corte, Fácil, Intermediário)
- Tempo estimado na máquina da pessoa
- Fresas necessárias, com ✓ para as que ela tem e ✗ para as que faltam
- O que ela aprende
- Botão "Fazer este projeto" (abre já configurado, pode editar)
Se não couber na máquina, o card aparece esmaecido com "Precisa de uma 48×30 ou AltMill".
Projetos:
- Teste de profundidade: 1, 2 e 3 gravados a 1, 2 e 3 mm numa sobra de MDF, sem recorte (primeiro corte)
- Porta-copos com inicial: disco de 10 cm recortado com abas (primeiro corte)
- Placa de porta em relevo: "Casa da Ana", moldura e furos (fácil)
- Plaquinha de pet: duas fresas, troca no meio (intermediário)
- Letreiro "Bem-vindos": cursiva recortada em compensado com fresa de compressão (intermediário)
- Chaveiro de acrílico: gravação em V e furo (intermediário)
- Placa de endereço grande: 90 × 30 cm, só máquinas grandes (intermediário)
A trilha "Comece aqui" é: Aplainar a mesa → Teste de profundidade → Porta-copos → Placa de porta. Mostre o progresso com marcas de concluído, sem exagero de gamificação.

9. NOVOS AVISOS
- "Precisa de acessório": aviso amarelo com botão "Ver na loja".
- "Fresa não serve para placas": erro, com sugestão de outra fresa que a pessoa tem.
- "Fresa de compressão: passada aumentada para 3,5 mm": aviso informativo.
- "Peça maior que a sua máquina": erro, mostrando em quais máquinas caberia.

10. CONFIGURAÇÃO > MINHA MÁQUINA
Mostre os dados da máquina só para leitura (área útil, velocidade máxima, cabeçote, controlador). Botão "Trocar máquina" refaz o onboarding. No fim da lista de máquinas, deixe uma opção discreta "Outra máquina (GRBL genérica)".

Comece pelo onboarding "Minha oficina" e pela galeria "Primeiros cortes"; depois atualize Criar (chip de fresa), Preparar (velocidade) e Cortar (dial do Makita).
