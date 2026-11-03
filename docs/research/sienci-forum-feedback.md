# O que donos de máquinas Sienci dizem sobre CAD/CAM e senders (pesquisa para o CarvCAM)

Data da pesquisa: 2026-11-03. Fonte principal: forum.sienci.com (Discourse). Fonte secundária: blog oficial da Sienci. Os links de tópicos usam o formato `https://forum.sienci.com/t/<id>`, que o Discourse redireciona para a URL completa. As citações estão em inglês, sem alteração.

---

## 1. Resumo executivo

- **O preço é a maior objeção, e a preferência por licença perpétua é forte.** As queixas sobre Vectric aparecem com frequência ("$800", "$350 upgrade for 1 sign", "absurd"), assim como a recusa a assinaturas ("I am a buy guy not a sub yup"). Também incomoda o Fusion tirar recursos da licença gratuita (rapids, tool change, arrange). O CarvCAM ser gratuito, com vitalício de $179, é um argumento direto. A âncora que o usuário usa hoje é o **MillMage, a $100 perpétuo**.
- **Mac é uma dor real e não resolvida.** Usuários de Mac compram um PC Windows, usam Parallels ou desistem do Vectric. O próprio staff da Sienci escreveu: "I only had my Mac laptop so Vectric was a no-go." Um build para Mac é hoje um dos poucos diferenciais que ainda podem pesar na decisão.
- **O iniciante quer ir da caixa ao primeiro corte sem trocar de contexto.** A própria Sienci reconhece o problema e está lançando, no gSender 1.7, um **sistema de plugins com "Simple Sign Maker" e "Simple CAM"**. Isso é ao mesmo tempo ameaça e oportunidade: o CarvCAM precisa se integrar ao gSender (carregar a peça direto ou virar plugin), não só exportar arquivo.
- **Bits e feeds/speeds específicos da Sienci são uma lacuna antiga.** Usuários reclamam que a biblioteca oficial não traz os bits do Starter Kit, que a tabela do AltMill está "pendente" desde 2024 e que os valores são conservadores demais. A biblioteca de bits Sienci já pronta, com feeds para LongMill e AltMill, é um gancho forte se for completa e mantida em dia.
- **Erros de G-code e de pós-processador assustam iniciantes:** "error 33", "bad number format", Z abaixo de zero, perguntas como "what is a post processor?". Um G-code verificado para o SLB/grblHAL, sem o usuário precisar escolher pós-processador, resolve uma dor recorrente.
- **A interface conta muito.** O VCarve é chamado de "clunky", "primitive" e "legacy Windows app appearance". O Fusion é visto como poderoso demais para placas simples. O espaço buscado é: "whip out CNC items pretty quick w/o struggling in Fusion 360".
- **A concorrência em CAM simples e barato aquece rápido em 2026.** O MillMage (da LightBurn, com Sienci como afiliada e staff elogiando), o RapidCAM (gratuito, no navegador, com V-carve, inlay e rotary) e o próprio gSender estão entrando nesse espaço. O CarvCAM precisa ser "o feito para Sienci", não só mais um CAM gratuito.
- **IA divide opiniões.** Há interesse em gerar relevo e imagem com ChatGPT ou Easy Create. Há também rejeição a IA na nuvem com créditos ("won't work airgapped"). Posicionar a IA como opcional, com o produto 100% offline, é o caminho seguro.

---

## 2. Dores e dúvidas recorrentes

### 2.1 Preço e modelo de licença (perpétua vs. assinatura). Visto em cerca de 14 tópicos.
- "I've no desire to give $800 to Vcarve." ([14353](https://forum.sienci.com/t/14353))
- "I dont want to pay $350 to upgrade to pro for 1 sign." ([12581](https://forum.sienci.com/t/12581))
- "it's absurd to me how expensive their software is compared to other industries." ([26605](https://forum.sienci.com/t/26605))

Outras fontes: [10614](https://forum.sienci.com/t/10614) ("I paid more for VCarve Desktop than I have for any other software in my life"), [11048](https://forum.sienci.com/t/11048) ("I wanted something I could own. Not perscription"), [21646](https://forum.sienci.com/t/21646), [17641](https://forum.sienci.com/t/17641) ("Autodesk do seem to keep hiking the prices"), [17772](https://forum.sienci.com/t/17772) ("$680 F360 tries to push on me to get basic functionality"), [27160](https://forum.sienci.com/t/27160) ("If something comes along that can replace it for a 1 time fee however then I may be interested"), [27414](https://forum.sienci.com/t/27414) e [26846](https://forum.sienci.com/t/26846) (licenças VCarve Pro revendidas por cerca de $500, com varejo de ~$700 USD).

### 2.2 Limite de área e tiling. Cerca de 8 tópicos.
O VCarve Desktop limita a área a 24"x24", mas as máquinas da Sienci têm 30x30, 30x48, 4x4 e 4x8.
- "I am annoyed by the 24"x24" limit since I have a 36"x36" bed" ([10614](https://forum.sienci.com/t/10614))
- "tiling will get old fast if you routinely do large jobs." ([26362](https://forum.sienci.com/t/26362))

Também: [11048](https://forum.sienci.com/t/11048) (braços de guitarra maiores que 24"), [27331](https://forum.sienci.com/t/27331) (tiling para aplainar um tampo maior que a 4x4), [17765](https://forum.sienci.com/t/17765) (tiling do Easel no gSender), [12569](https://forum.sienci.com/t/12569) (slab de 72"), [20936](https://forum.sienci.com/t/20936) (peça de 51" em AltMill 4x2).

### 2.3 Mac e Linux. Cerca de 6 tópicos.
- "I hate needing a Windows PC to run Vectric - I cannot understand why so many software vendors exclude Linux & Mac" ([16949](https://forum.sienci.com/t/16949))
- "When I seen that VCarve Pro only ran on Windows, I was very disappointed." ([16949](https://forum.sienci.com/t/16949))
- "I only had my Mac laptop so Vectric was a no-go." (staff da Sienci, [26605](https://forum.sienci.com/t/26605))

Também: [26605](https://forum.sienci.com/t/26605) ("They going to have a native apple silicon version?"), [26507](https://forum.sienci.com/t/26507) (Parallels exige assinatura ou "$200+ and then on top of that cost of Windows"), [12795](https://forum.sienci.com/t/12795) (pai e filho no Mac com erros de G-code). Observação: o gSender roda no Mac. Por isso muitos usam "design on Windows, carve with a Mac".

### 2.4 Curva de aprendizado e interface. Cerca de 10 tópicos.
- "what I'm really looking for is something that can whip out CNC items pretty quick w/o struggling in Fusion 360" ([26540](https://forum.sienci.com/t/26540))
- "I find Vectrics interface super clunky, why can't I keep a property sheet up for objects to edit size and position all the time" ([25675](https://forum.sienci.com/t/25675))
- "we did a trial of vcarve pro, and it felt primitive to what she is used to." ([25233](https://forum.sienci.com/t/25233))

Também: [21045](https://forum.sienci.com/t/21045) ("I found Carbide Create easier to use even though I know VCarve is more powerful… My problem is sitting down and taking the time to learn the software"), [26843](https://forum.sienci.com/t/26843) ("Fusion has a bad habit of making simple things either very difficult or in some cases even impossible"), [16514](https://forum.sienci.com/t/16514) ("I would so be down if there was some classes to walk us through everything and how to do a simple file in carveco, and then set up in gsender"), [26362](https://forum.sienci.com/t/26362) ("I really wish it had a way to make things parametric"), [14176](https://forum.sienci.com/t/14176) (Men's Shed: "otherwise it'll go unused as it's too complicated and intimidating").

### 2.5 Feeds & speeds e biblioteca de bits Sienci. Cerca de 9 tópicos.
- "I don't think there is one single bit in the starter kit that is in their database." ([25563](https://forum.sienci.com/t/25563))
- "Tool Libraries are needed." / "Recommendations appear very conservative compared to other tool databases." ([14094](https://forum.sienci.com/t/14094))
- A tabela de feeds do AltMill foi prometida em 2024 e ainda estava pendente em março de 2026: "Once these products are shipping, then we will be able to put out a full spread of updates" ([14176](https://forum.sienci.com/t/14176))

Também: [25563](https://forum.sienci.com/t/25563) (alguém aplicou os feeds de um vídeo feito para outra fresa de aplainar e "caused my board to almost catch on fire!"), [26889](https://forum.sienci.com/t/26889) (fresa de desbaste Sienci 3/8" e conflito de chip load), [26215](https://forum.sienci.com/t/26215) (corte em madeira dura deu errado), [26561](https://forum.sienci.com/t/26561), [25090](https://forum.sienci.com/t/25090) (bit extra-longo Sienci sem valores), [5412](https://forum.sienci.com/t/5412) (sem biblioteca Sienci para Carbide Create), [26942](https://forum.sienci.com/t/26942) (bit faltando no banco Sienci do Carveco).

### 2.6 Pós-processador e erros de G-code. Cerca de 10 tópicos.
- "Interesting question about 'post processor', not sure I know how to answer." ([14353](https://forum.sienci.com/t/14353))
- "I tried all the post processing options, and the ones that worked gave constant 'bad number format' errors" ([12795](https://forum.sienci.com/t/12795))
- Inch posts "won't add enough decimal places to satisfy arc curve calculations – which will cause an Error 33" ([16897](https://forum.sienci.com/t/16897))

Também: [11048](https://forum.sienci.com/t/11048) ("it says I need something called 'Post Processor G-code Arcs (inch)'… What is that?"), [12019](https://forum.sienci.com/t/12019) e [21468](https://forum.sienci.com/t/21468) (erros 25/33 com Fusion), [16788](https://forum.sienci.com/t/16788) (o Fusion "has only grbl" e o AltMill usa grblHAL), [11121](https://forum.sienci.com/t/11121) (Z abaixo de zero), [14318](https://forum.sienci.com/t/14318) e [27298](https://forum.sienci.com/t/27298) (precisão do post imperial).

### 2.7 Primeiro projeto e mudança de contexto entre CAM e sender. Cerca de 5 tópicos e o blog da Sienci.
- "Can gsender 1.5.7. convert SVG file to gcode" ([26047](https://forum.sienci.com/t/26047))
- "Does Easel work well with the Altmill? Do you have to use easel to control your machine or does it allow you to use G Sender?" ([27047](https://forum.sienci.com/t/27047))
- Sienci, no blog: "You've setup your machine, installed your software, and have no easy way to enjoy the fruits of your labour without a massive context switch to some design software." ([blog gSender 1.7](https://sienci.com/2026/07/30/whats-coming-in-gsender/))

Também: [26507](https://forum.sienci.com/t/26507) (confusão entre coordenadas de máquina e de trabalho ao levar uma peça do Fusion para o AltMill), [12795](https://forum.sienci.com/t/12795) ("I'd really like something with a free demo mode so I can make a part start to finish before dropping money on software").

### 2.8 Inlays. Cerca de 6 tópicos.
- "I spent some time trying to get the inlays correct by watching YouTube videos and couldn't get it." ([27224](https://forum.sienci.com/t/27224))
- "the plug was always too small" (Carbide Create, [14368](https://forum.sienci.com/t/14368))

Também: [17693](https://forum.sienci.com/t/17693), [16986](https://forum.sienci.com/t/16986) (partes pequenas do macho quebrando), [15263](https://forum.sienci.com/t/15263), [10614](https://forum.sienci.com/t/10614) (o Carveco Maker tem problemas com "inlays").

### 2.9 Múltiplas cópias e nesting. Cerca de 5 tópicos.
- O Fusion não deixa repetir uma peça várias vezes no mesmo bloco de material de forma simples ([26843](https://forum.sienci.com/t/26843)). Um usuário sugere: "ncSender has a copy feature that lets you repeat the g-code of one model. It would be a nice gSender feature too."
- "I started out trying to make 7 of them on my piece of scrap plywood but got bogged down trying to deal with groupings" (Carbide Create, [21440](https://forum.sienci.com/t/21440))

Também: [16746](https://forum.sienci.com/t/16746) (padrão no Fusion), [27237](https://forum.sienci.com/t/27237) (um usuário criou o Nestomatic, um SaaS de nesting usado com AltMill), [25631](https://forum.sienci.com/t/25631) (pedido de câmera para encaixar cortes em retalhos de material).

### 2.10 Rotary (Vortex) e 4 eixos. Cerca de 6 tópicos.
- "I was hoping this software would have rotary functions… I just need a software to generate that Gcode." ([26605](https://forum.sienci.com/t/26605))
- "Aspire has it, but the price of Aspire is just too high for a hobbyist like me." ([26605](https://forum.sienci.com/t/26605))

Também: [26874](https://forum.sienci.com/t/26874) ("I have a rotary but I am hardly using it since it has been quite a lot of trouble"), [15065](https://forum.sienci.com/t/15065) (pós-processador do eixo A), [17424](https://forum.sienci.com/t/17424) (rotary no Fusion exige extensão paga), [27115](https://forum.sienci.com/t/27115) (rotary no LightBurn), [26708](https://forum.sienci.com/t/26708) (o RapidCAM já anuncia suporte a rotary).

### 2.11 3D, relevo e IA. Cerca de 6 tópicos.
- "Is it possible to use ChatGPT for generating relief images for CNC?" ([26682](https://forum.sienci.com/t/26682)). A resposta da comunidade aponta o Vectric Easy Create, pago por modelo.
- "AI checks all the boxes of what I don't want to see (hate) in software. It's cloud based so won't work airgapped" ([21646](https://forum.sienci.com/t/21646))

Também: [11485](https://forum.sienci.com/t/11485) (busca por STL de relevo), [27160](https://forum.sienci.com/t/27160) (MillMage Pro, de height map a G-code: "incredibly fast"), [27461](https://forum.sienci.com/t/27461) (logos feitos com IA chegam como PNG e precisam ser vetorizados).

---

## 3. Opiniões sobre cada concorrente

**Vectric (Cut2D / VCarve Desktop / Pro / Aspire)** é o padrão de fato do fórum.
- O que elogiam: CAM simples para 2D e 2,5D, muitos tutoriais (Mark Lindsay, Kyle Ely), upgrade pagando só a diferença, licença perpétua. "You can't beat it's simplicity for that step of the workflow" ([25233](https://forum.sienci.com/t/25233)).
- O que odeiam: o preço (Desktop ~$349, Pro ~$699 USD, Aspire +$1300; [27160](https://forum.sienci.com/t/27160)), o limite de 24x24 no Desktop, só rodar em Windows, a interface antiga e o trial que só gera G-code dos projetos de exemplo ([17588](https://forum.sienci.com/t/17588), [26605](https://forum.sienci.com/t/26605): "at least theirs lets you carve!").

**Fusion 360**
- O que elogiam: é gratuito para uso pessoal, tem CAD paramétrico e CAM potente (adaptive, alumínio), e roda no Mac ([26540](https://forum.sienci.com/t/26540), [16949](https://forum.sienci.com/t/16949)).
- O que odeiam: curva íngreme; versão gratuita "defeatured" (sem rapids, sem tool change, sem parte do arrange; [27160](https://forum.sienci.com/t/27160), [16949](https://forum.sienci.com/t/16949)); aumentos de preço; complicado para coisas simples, como várias cópias ([26843](https://forum.sienci.com/t/26843)); fraco em V-carve e relevo artístico ([25233](https://forum.sienci.com/t/25233)).

**Carveco / Carveco Maker**
- O que elogiam: interface mais moderna e sem limite de área ([10614](https://forum.sienci.com/t/10614), [26362](https://forum.sienci.com/t/26362)). Há interesse no recurso de IA ([21646](https://forum.sienci.com/t/21646)).
- O que odeiam: a assinatura, problemas de redimensionamento, inlays e toolpaths "that cut same area twice and jump all over the project" ([10614](https://forum.sienci.com/t/10614)), o desbaste de V-carve só em offset ([25893](https://forum.sienci.com/t/25893)) e a forma como gerencia o tamanho da peça ([25233](https://forum.sienci.com/t/25233)).

**Carbide Create**
- O que elogiam: tem versão para Mac, é fácil e a Pro custa ~$120/ano ([16949](https://forum.sienci.com/t/16949), [21045](https://forum.sienci.com/t/21045)).
- O que odeiam: a versão gratuita não exporta G-code fora do ecossistema Carbide ([6499](https://forum.sienci.com/t/6499)), não há biblioteca Sienci ([5412](https://forum.sienci.com/t/5412)) e há erros de pós-processador ([12795](https://forum.sienci.com/t/12795)). "Very quickly grew frustrated with it" ([17641](https://forum.sienci.com/t/17641)).

**Easel (Inventables)**
- O que elogiam: rápido para coisas simples, tem boa biblioteca de clipart, o Easel Cabinetmaker e um mês grátis ([26540](https://forum.sienci.com/t/26540), [21045](https://forum.sienci.com/t/21045)).
- O que odeiam: depende de internet (um usuário que gerava no VCarve e rodava pelo Easel escreveu "I want to get away from the Internet"; post de 2025-03-19 achado na busca "Easel", sem o ID do tópico), o controle de máquina se confunde com o gSender ([12619](https://forum.sienci.com/t/12619), [25640](https://forum.sienci.com/t/25640)) e não tem controle de direção de corte ([25675](https://forum.sienci.com/t/25675)).

**MillMage (LightBurn)** é o concorrente mais perigoso em 2026.
- Pontos fortes citados: $100 perpétuo, roda em Mac, controla a máquina direto ou exporta para o gSender, Pro com V-carve, relevo, nesting e centerline trace, e staff da Sienci elogiando ([26605](https://forum.sienci.com/t/26605)). A recomendação já se repete para iniciantes ([26047](https://forum.sienci.com/t/26047), [26362](https://forum.sienci.com/t/26362)).
- Pontos fracos: rotary ainda não existe ("Out of the gate no, but eventually yes"), há dúvida sobre suporte e comunidade para "an overwhelmed newbie" ([26362](https://forum.sienci.com/t/26362)) e há quem ache que é assinatura ([27160](https://forum.sienci.com/t/27160)).

**RapidCAM** é gratuito, roda no navegador, local, tem 2,5D paramétrico, V-carve e inlay, rotary, laser, relevo de STL, "pre-flight safety checks" e envio ao gSender pela rede ([27116](https://forum.sienci.com/t/27116), [26688](https://forum.sienci.com/t/26688)). A sobreposição com o CarvCAM é quase total. A recepção no fórum ainda é pequena.

**Outros:** Kiri:Moto ("runs great for simple models but it ran into problems when I tried it with more complicated models", [16949](https://forum.sienci.com/t/16949)); FreeCAD (melhorando, mas "brittle" e com V-carve limitado, [16949](https://forum.sienci.com/t/16949), [26362](https://forum.sienci.com/t/26362)); Solidworks Maker ($24–48/ano, [17772](https://forum.sienci.com/t/17772)); LightBurn como padrão em laser ([26605](https://forum.sienci.com/t/26605)).

---

## 4. Tabela de recursos

| Recurso | Evidência | Já temos? | Impacto na decisão | Esforço | Recomendação |
|---|---|---|---|---|---|
| Gratuito, sem limite de área, export ilimitado | [10614](https://forum.sienci.com/t/10614), [12581](https://forum.sienci.com/t/12581), [11048](https://forum.sienci.com/t/11048), [14353](https://forum.sienci.com/t/14353) | sim | alto | — | Free (comunicar muito) |
| Build para Mac (Apple Silicon) | [16949](https://forum.sienci.com/t/16949), [26605](https://forum.sienci.com/t/26605), [26507](https://forum.sienci.com/t/26507), [12795](https://forum.sienci.com/t/12795) | não | alto | médio | Free |
| Integração com gSender: enviar pela rede, "Load to gSender" ou plugin | [blog 1.7](https://sienci.com/2026/07/30/whats-coming-in-gsender/), [27047](https://forum.sienci.com/t/27047), [26605](https://forum.sienci.com/t/26605), [27116](https://forum.sienci.com/t/27116) | parcial (só export) | alto | médio | Free |
| Biblioteca de bits Sienci completa (Starter Kit, chanfro, V 30°, desbaste extra-longo) com feeds para LongMill, AltMill e cada spindle | [25563](https://forum.sienci.com/t/25563), [14094](https://forum.sienci.com/t/14094), [14176](https://forum.sienci.com/t/14176), [25090](https://forum.sienci.com/t/25090) | parcial (15 bits) | alto | baixo | Free |
| G-code sem escolher pós-processador (mm, grblHAL/SLB, sem erro 33) e verificador | [12795](https://forum.sienci.com/t/12795), [16897](https://forum.sienci.com/t/16897), [11048](https://forum.sienci.com/t/11048), [16788](https://forum.sienci.com/t/16788) | sim | alto | baixo | Free (comunicar) |
| Primeiro corte guiado (aplainar spoilboard, placa com nome) | [25563](https://forum.sienci.com/t/25563), [16514](https://forum.sienci.com/t/16514), [blog 1.7](https://sienci.com/2026/07/30/whats-coming-in-gsender/) | sim | alto | — | Free |
| Painel de propriedades sempre visível (tamanho e posição) | [25675](https://forum.sienci.com/t/25675), [25233](https://forum.sienci.com/t/25233) | verificar | médio | baixo | Free |
| Repetir N cópias ou grid de uma peça no material | [26843](https://forum.sienci.com/t/26843), [21440](https://forum.sienci.com/t/21440), [16746](https://forum.sienci.com/t/16746) | parcial (nesting Pro) | médio | baixo | Free (grid simples); nesting real no Pro |
| Tiling (peça maior que a mesa) | [12581](https://forum.sienci.com/t/12581), [27331](https://forum.sienci.com/t/27331), [11048](https://forum.sienci.com/t/11048) | Pro | médio | médio | Pro (evitar ar de "paywall de área") |
| Inlay V-carve guiado (folgas, macho e fêmea) | [27224](https://forum.sienci.com/t/27224), [14368](https://forum.sienci.com/t/14368), [16986](https://forum.sienci.com/t/16986) | Pro | médio/alto | médio | Pro, com 1 inlay demo no Free |
| Relevo 3D a partir de STL ou height map | [26682](https://forum.sienci.com/t/26682), [27160](https://forum.sienci.com/t/27160), [11485](https://forum.sienci.com/t/11485) | planejado | médio | alto | Pro |
| Rotary Vortex | [26605](https://forum.sienci.com/t/26605), [26874](https://forum.sienci.com/t/26874), [17424](https://forum.sienci.com/t/17424) | não | médio (nicho fiel) | alto | Pro (fase 2) |
| Desbaste raster para V-carve e clearance | [25893](https://forum.sienci.com/t/25893) | verificar | baixo | baixo | Free |
| Vetorizar imagem e logo de IA | [27461](https://forum.sienci.com/t/27461), [26682](https://forum.sienci.com/t/26682) | sim | médio | — | Free |
| Assistente de IA opcional e offline-first | [21646](https://forum.sienci.com/t/21646), [26682](https://forum.sienci.com/t/26682) | sim | baixo/médio | — | Manter opcional |
| Laser (LaserBeam) | [16488](https://forum.sienci.com/t/16488), [15455](https://forum.sienci.com/t/15455) | não | baixo (LightBurn domina) | alto | Não fazer agora |
| Câmera para layout em retalhos | [25631](https://forum.sienci.com/t/25631) | não | baixo | alto | Não fazer |
| Cabinetry e peças de chapa | [21045](https://forum.sienci.com/t/21045), [27160](https://forum.sienci.com/t/27160) | parcial (multi-part Pro) | médio (AltMill 4x8) | alto | Pro (futuro) |

---

## 5. Top 5 para virar a "escolha fácil", e ganchos de mensagem

1. **Do CarvCAM ao gSender em um clique, pela rede.** O gSender 1.7 terá plugins e "Load to gSender" remoto. Ser o CAM que aparece dentro ou ao lado do gSender transforma o CarvCAM no caminho natural, antes que o Sign Maker oficial ou o MillMage ocupem o espaço. Vale avaliar um plugin "CarvCAM Lite" com nome e placa que abre o app completo.
2. **Build para Mac.** É a maior dor sem solução barata. O MillMage está nesse espaço e é a referência de comparação.
3. **Biblioteca Sienci completa e com feeds específicos por máquina e spindle**, incluindo todos os bits dos kits vendidos e a AltMill 2,2 kW. É o que os usuários pedem à própria Sienci há dois anos.
4. **"Zero escolha de pós-processador": G-code verificado e simulado para o SLB.** Já existe; falta destacar isso no onboarding e na comunicação.
5. **Cópias, grid e inlay guiado acessíveis.** O grid simples deve ficar no Free. O inlay no Pro, com um projeto de demonstração gratuito. Inlay e "fazer 7 iguais" são os primeiros projetos ambiciosos e onde as pessoas travam.

**Ganchos nas palavras dos usuários:**
- "Something you can **own**. Not a subscription." Combina com o vitalício de $179 e responde a [11048](https://forum.sienci.com/t/11048) e [21646](https://forum.sienci.com/t/21646).
- "**Whip out** signs and parts pretty quick, without struggling in Fusion." ([26540](https://forum.sienci.com/t/26540))
- "No 24×24 limit. Use your **whole** LongMill or AltMill." ([10614](https://forum.sienci.com/t/10614))
- "No need to pay $350 to upgrade for one sign." ([12581](https://forum.sienci.com/t/12581))
- "Your first carve **without the massive context switch**." (linguagem da própria Sienci, [blog](https://sienci.com/2026/07/30/whats-coming-in-gsender/))
- "Works **airgapped**. AI is optional." ([21646](https://forum.sienci.com/t/21646))
- "Every bit in your Starter Kit, already loaded, with feeds for **your** machine." ([25563](https://forum.sienci.com/t/25563))
- "What's a post processor? You don't need to know." ([14353](https://forum.sienci.com/t/14353), [11048](https://forum.sienci.com/t/11048))

**Alerta de posicionamento:** o Pro a $69/ano parece assinatura, e parte do público rejeita assinatura de forma explícita. Recomenda-se dar destaque ao vitalício de $179 e deixar claro que o Free não perde nada com o tempo. É o oposto do "defeaturing" do Fusion, que é muito criticado.

---

## 6. Método e limitações

- **Como acessei:** o acesso direto (curl/WebFetch) a forum.sienci.com foi bloqueado pelo proxy da sessão. O conteúdo foi lido pelo Exa (`web_fetch_exa`), usando os endpoints `search.json?q=… after:2024-01-01` e `/raw/<topic_id>` (texto completo dos tópicos).
- **Buscas feitas:** Easel, Carveco, Fusion 360, beginner software, vcarve price, Carbide Create, kiri moto, inlay, vortex rotary software, tiling, feeds and speeds, subscription, rapidcam, millmage, gsender feature request, selling signs, nesting, lightburn laser, first project, post processor error 33, tool library, broke bit, mac vectric, chatgpt, camera. Também li o blog da Sienci sobre o gSender 1.7 e fiz uma busca Exa por Reddit.
- **Tópicos lidos por inteiro (raw):** 26540, 16949, 25233, 26605, 17772, 17641, 21045, 10614, 26507, 12581, 27160, 27237, 26843, 27116, 26362, 26047, 25675, 21646, 14353, 11048, 25893, 14094, 14176, 12795, 25563, 27461 e 26682. Os demais tópicos citados foram lidos apenas pelo trecho (blurb) dos resultados de busca. As citações deles se limitam a esse trecho.
- **Frequências** são estimativas: contagem de tópicos distintos que encontrei sobre cada tema, e não uma contagem exaustiva. A busca do Discourse traz cerca de 50 posts por página e não paginei tudo.
- **Não consegui acessar:** Reddit (a busca Exa só trouxe fóruns da Sienci, Onefinity e outros, nada de r/hobbycnc relevante), Facebook (grupo LongMill) e comentários do YouTube. Por isso não há citações dessas fontes.
- **Vieses:** os moderadores e usuários mais ativos (gwilki, Chucky_ott, Spamming_Eddie) usam Vectric e têm mais voz. Quem sofre em silêncio ou desiste não aparece. Os posts de staff da Sienci e da LightBurn têm conflito de interesse, que eles mesmos declaram.
