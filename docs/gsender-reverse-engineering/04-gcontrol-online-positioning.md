# gControl, versão online e posicionamento

Fontes consultadas em out/2026:
- [gControl Panel Computer](https://sienci.com/product/gcontrol/)
- [Choosing Software – Sienci Resources](https://resources.sienci.com/view/lmk2-choosing-software/)

---

## 1. gControl: o que muda na interface

**O aparelho.** Windows 11 IoT, tela touch de 15,6″ em 1920×1080, processador Intel N150 (modesto), 8 GB de RAM. Vem com o gSender pré-instalado e fica preso na máquina. Duas reclamações nas avaliações: "seria melhor se abrisse o gSender sozinho" e "queria um processador mais rápido".

**Consequências para o design:**

| Fato | Impacto | O que fazer |
|---|---|---|
| Touch, uso de pé ao lado da máquina, mão suja ou de luva | Alvos de 44 px ficam pequenos; não existe hover | Modo "Painel": alvos ≥ 56 px, nada que dependa de hover, arrastar com tolerância maior, jog pad grande |
| 15,6″ a ~1 m de distância | Textos de 12–13 px ficam ilegíveis | Escala tipográfica +2 px, números de coordenada maiores |
| O Windows usa escala de 125–150% nessa tela | A janela útil cai para **1536×864 ou 1280×720** | O layout precisa funcionar em 1280×720 (hoje o mínimo é 1280×760) |
| N150 | Prévia 3D e simulação em alta resolução pesam | Simulação em resolução menor, 3D sob demanda, worker do motor com prioridade baixa durante o corte |
| O teclado é o virtual do Windows | Digitar é ruim | Em Criar, priorizar chips, sliders e o assistente; campos numéricos com ± |
| Fica na máquina | É o lugar de Posicionar e Cortar | Abrir direto em Posicionar/Cortar quando detectar o gControl; Criar continua disponível |
| "Seria bom abrir sozinho" | Atrito toda vez que liga | Modo quiosque: abrir em tela cheia ao ligar o Windows |

**Detecção:** `pointer: coarse` com largura ≤ 1920 (ou parâmetro `?panel=1` / opção em Settings) liga o modo Painel. A troca é por variáveis CSS (`--control-h`, `--font-scale`, `--panel-w`), sem duplicar telas.

---

## 2. Versão online: vale a pena?

O motor de CAM já roda inteiro no navegador (Web Worker). Ter uma versão web custa pouco tecnicamente. A questão é **o que** fica online.

### A favor
- **Sem instalação:** abre no Mac, Chromebook, tablet e celular. Dá para desenhar no sofá e cortar na oficina.
- **Atualizações instantâneas** para todo mundo, sem baixar instalador.
- **Assistente de IA sem pedir chave:** o servidor guarda a chave da Claude API, então o custo e o controle ficam com a Sienci (ou com você).
- **Projetos na nuvem:** salvar, compartilhar, galeria de "remix", e abrir no gControl o que foi desenhado em casa.
- **Aquisição:** quem ainda não tem máquina testa o fluxo inteiro e vê quanto tempo levaria numa LongMill. Isso vira um funil de vendas.
- **Precedentes:** o Easel (online) e o próprio CAMLab da Sienci (online, baseado no Kiri:Moto).

### Contra
- **Controlar a máquina pelo navegador é frágil:**
  - O Web Serial só existe no Chrome e no Edge (não no Safari nem no Firefox).
  - Abas em segundo plano são estranguladas pelo navegador e o computador pode dormir no meio de um corte de 40 minutos.
  - A AltMill e a SLB-EXT por Ethernet não são acessíveis direto do navegador.
  - O gSender usa um servidor Node local justamente por isso.
- **Oficina sem internet:** um app que só funciona online para no pior lugar.
- **Custos recorrentes:** hospedagem, IA, suporte, contas de usuário, LGPD/GDPR.
- **Segurança:** G-code vindo da nuvem precisa do mesmo verificador local antes de ir para a máquina (já existe no motor).

### Recomendação: híbrido, um só código
1. **Web ("Studio"):** Criar + Preparar + exportar ou enviar o G-code para a oficina. Nada de mover máquina.
2. **Desktop e gControl (Electron com o servidor do gSender):** o fluxo completo, funcionando offline.
3. **Ponte:** projeto salvo na nuvem → aparece em "Recentes" no gControl. A máquina só é comandada pelo app local.

---

## 3. Posicionamento

### O que o gSender diz hoje
> "No. gSender is strictly a CNC control software and has no features currently for g-code generation […] You'll need to use gSender in combination with some other CAM, or design + CAM, software."

A própria página de software da Sienci mostra um exemplo de três programas (Illustrator → Carbide Create → gSender) e um assistente que escolhe entre mais de 80 ferramentas. Para quem está começando, isso é a maior barreira entre "a máquina chegou" e "meu primeiro corte".

### Estamos substituindo as ferramentas que eles sugerem?

| Ferramenta sugerida | Para quê | Substituímos? |
|---|---|---|
| **Vectr** (design 2D online) | Placas simples | **Sim**, para placas e letreiros |
| **Easel** (design + CAM + interface, online) | Placas, recortes simples | **Em boa parte:** texto, formas, ícones, relevo, gravação, recorte com abas, furos. Falta importar SVG e imagem |
| **Carbide Create** (design + CAM 2D/2.5D) | Placas, V-carve, SVG/DXF | **Parcialmente:** placas sim; V-carve de verdade e importar SVG/DXF ainda não |
| **Inkscape** (vetores + plugins CNC) | Arte vetorial | **Não:** não desenhamos arte livre; o caminho é importar SVG |
| **F-Engrave** (gravação e V-carve) | Textos em V | **Parcialmente:** gravamos com V-bit seguindo o contorno, sem profundidade variável |
| **Halftoner** (meio-tom de foto) | Fotos | **Não** |
| **Kiri:Moto / CAMLab** (CAM 3D no navegador) | Relevos 3D a partir de STL | **Não.** O CAMLab é da Sienci: o caminho é integrar, não refazer |
| **Carveco, VCarve, Onshape, Fusion** | Uso avançado | **Não** e não deve: é outro público |

**Conclusão:** resolvemos o problema para o **primeiro corte e para o projeto mais comum de quem começa**: placa, letreiro, nome, porta-copos, chaveiro, recorte simples. É a faixa em que hoje a pessoa precisa aprender dois ou três programas. Não substituímos o kit de ferramentas inteiro, e isso precisa ficar claro na mensagem.

### Lacunas, em ordem de impacto
1. **Importar SVG/DXF** (logos, arte da internet, Inkscape/Illustrator). Destrava a maior parte dos casos "Easel/Carbide Create". O motor já trabalha com regiões 2D; falta o leitor de SVG.
2. **V-carve de verdade** (profundidade variável com V-bit): é o "visual de placa profissional" que leva gente ao Carbide Create e ao VCarve.
3. **Imagem → gravação** (silhueta ou meio-tom).
4. **Relevo 3D:** integrar o CAMLab (Sienci) dentro do mesmo fluxo, em vez de mandar a pessoa para outro site.

### Proposta de mensagem

**Uma frase:**
> **gSender now designs, too: go from idea to your first cut without leaving gSender.**

**Para a FAQ (substituindo o texto atual):**
> **Can gSender make the g-code for me?**
> Yes, for the projects most people start with. gSender's **Create** step lets you design signs, name plaques, coasters, cut-out lettering and simple shapes, by typing what you want or editing it directly. It already knows your machine, your router and the Sienci bits you own, picks safe speeds from our official table and checks the job before you carve. For artwork-heavy work (V-carved art, photos, 3D reliefs), keep using your favourite design + CAM software. gSender still opens their files, just like before.

**Pilares:**
1. **Do zero ao primeiro corte num só lugar:** sem toolchain para montar.
2. **Feito para a sua máquina:** área, router, fresas e velocidades da Sienci já configurados.
3. **Seguro por padrão:** cada arquivo é verificado e simulado antes de cortar.
4. **Cresce com você:** quando quiser mais, importe de qualquer CAM. O gSender continua sendo o melhor sender.

**Para quem é (e para quem não é):**
- **Para:** quem acabou de receber uma LongMill ou AltMill, quem faz placas e presentes, escolas e makerspaces.
- **Não substitui:** VCarve ou Fusion para quem já domina e faz arte complexa ou peças mecânicas.

**Riscos de posicionamento:**
- **Não prometer substituir o CAM inteiro.** Quem tentar fazer um V-carve artístico vai se frustrar. Mostre os limites na própria interface: na galeria, um "Coming soon: SVG import, V-carve".
- **Parceiros:** a Sienci recomenda Carbide Create, Vectric e Carveco, e vende o VCarve Pro na loja. A mensagem deve ser "começa aqui, cresce com eles", não "você não precisa deles".
