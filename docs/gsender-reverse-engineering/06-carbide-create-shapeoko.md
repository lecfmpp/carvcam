# Carbide Create Core e máquinas Shapeoko

Fonte: https://carbide3d.com/carbidecreate/core-vs-pro/ (lida em 25/10/2026), especificações da Shapeoko 4, da Shapeoko 5.1 Pro e do Carbide Compact Router na loja da Carbide 3D, e a comunidade da Carbide 3D.

## 1. O ponto que muda o posicionamento

O **Carbide Create Core** é grátis, mas **só gera G-code para máquinas Carbide 3D** (Shapeoko e Nomad). Salvar "G-code padrão para qualquer CNC" é recurso do **Pro**, que custa US$ 120 por ano ou US$ 360 vitalício.

Daí saem duas consequências:

- **Dono de Sienci:** não pode usar o Core. Nosso produto entrega de graça o que a Carbide cobra (G-code para qualquer máquina GRBL). Isso reforça o posicionamento do doc 04.
- **Dono de Shapeoko:** já tem o Core de graça, e ele tem mais ferramentas de desenho que nós. Para atrair essa pessoa, não basta funcionar com a máquina dela. Precisamos de, no mínimo, os recursos de desenho do Core, mais o que ele não tem: assistente de IA, roteiro guiado, checagem antes de cortar e navegador ou gControl.

Todas as Shapeoko rodam **GRBL 1.1** (placa ATmega, inclusive a 5 Pro). O G-code do nosso pós-processador GRBL já roda nelas. O Carbide Motion, que é o programa de controle delas, carrega qualquer arquivo `.nc`. A troca de fresa com BitSetter usa `M6 Tn`, que já emitimos quando o projeto tem mais de uma fresa.

## 2. Recursos do Core comparados com os nossos

Legenda: ✅ temos · 🟡 parcial · ❌ não temos.

### Desenho

| Recurso do Core | Nós | Observação e o que falta |
| --- | --- | --- |
| Formas básicas, polígonos, polilinhas | 🟡 | Temos retângulo (com raio), círculo e linha. Faltam polígono regular, estrela e polilinha livre. |
| Curvas Bézier | ❌ | Por enquanto só chegam por SVG importado. Falta a ferramenta de caneta com nós editáveis. |
| Texto reto e em arco | 🟡 | Texto reto com 3 fontes. Falta texto em arco e mais fontes (inclusive de traço único para gravar com V). |
| Operações booleanas (soldar, unir, interseção, subtrair) | 🟡 | O motor já faz tudo isso (Clipper2), mas a interface não expõe. Hoje elementos em relevo se unem sozinhos. |
| Offset de vetor (para dentro e para fora) | ❌ | O motor já tem `offset()`. Falta a ação na interface ("contorno de X mm", que serve para moldura de letreiro). |
| Ferramentas de alinhamento | ❌ | Hoje é só arrastar. Faltam alinhar e distribuir, e centralizar na placa. |
| Imagem de fundo para decalcar | ❌ | É simples: imagem como camada de referência, que não é cortada. |
| Imagem para vetor automático | ❌ | Exige vetorizador (potrace em WASM ou imagetracer.js), com limiar e suavização. |
| Importar SVG e DXF | 🟡 | **SVG feito nesta rodada.** Falta DXF (LINE, LWPOLYLINE, ARC, CIRCLE, SPLINE). |
| Biblioteca de elementos de design | 🟡 | 4 ícones. Falta uma biblioteca em SVG (bordas, molduras, ícones), que agora dá para alimentar pelo importador. |

### Usinagem

| Recurso do Core | Nós | Observação e o que falta |
| --- | --- | --- |
| Pocket (rebaixo) | ✅ | Por anéis concêntricos, com verificação e simulação. |
| Contorno por dentro e por fora | 🟡 | Fazemos por fora (perfil com abas) e por dentro (vazados). Falta "no traço" e escolher dentro/fora por elemento. |
| **V-carving** | ❌ | **É a maior lacuna.** Hoje a fresa em V só segue o traço numa profundidade fixa. V-carve de verdade varia a profundidade pela largura do traço (eixo medial), que é o que deixa letras bonitas. |
| Gravação básica | ✅ | Gravado com fresa reta e traço com V. |
| Biblioteca de fresas com avanços e rotações | ✅ | Catálogo Sienci com tabela oficial. Falta a biblioteca Carbide 3D (seção 3). |
| Simulação 3D | ✅ | Mapa de alturas em 3D e vista de cima. |

### Recursos do Pro (para registrar)

| Recurso | Nós | Observação |
| --- | --- | --- |
| G-code padrão para qualquer CNC | ✅ | **De graça para nós.** É o argumento principal. |
| Gravação avançada (contorno com hachura) | ❌ | É fácil depois do V-carve: preencher com linhas paralelas. |
| Usinagem de sobra (rest machining) | 🟡 | O motor já calcula onde a fresa não alcança (`unreachable`). Falta passar uma segunda fresa menor só ali. |
| Entrada em rampa (contorno e pocket) | ❌ | Hoje mergulhamos reto e limitamos o mergulho a 300 mm/min. Rampa é melhor para a fresa e entra na fase 1 do doc 05. |
| Desbaste e acabamento 3D, STL, imagem como relevo | ❌ | Fases 2 e 3 do doc 05 (motor do Kiri:Moto). |
| Divisão em partes (tiling) | ❌ | Útil para Shapeoko 4 Standard e LongMill 12×30. Entra depois. |

### Plataforma

| | Core | Nós |
| --- | --- | --- |
| Mac e Windows, funciona sem internet | ✅ | Desktop (Electron, como o gSender) e navegador. Funcionar sem internet no navegador exige PWA, que falta. |
| Treinamento em vídeo | ✅ | Cartões de vídeo na interface (os links ainda faltam). |

## 3. Como incluir as Shapeoko

### Catálogo de máquinas multimarca

Hoje o catálogo está no namespace `sienci`. A proposta é:

- Criar `catalog/carbide3d/` com a mesma forma de dados (máquinas, cabeçotes, fresas, tabela e projetos), atrás de um registro comum `catalog/index.ts` (`brands: sienci | carbide3d | generic`).
- `SienciConfig` vira `MachineConfig { brand, machine, head, bit, ... }`. O nome antigo continua como apelido para não quebrar nada.
- Na interface, o seletor de máquina ganha a marca no topo: **Sienci Labs** (primeiro, porque é o foco), **Carbide 3D** e **Outra máquina GRBL**. A última pede curso X/Y/Z e o tipo de cabeçote.

### Máquinas (cursos oficiais da Carbide 3D)

| Máquina | Curso X × Y × Z | Movimento | Cabeçote |
| --- | --- | --- | --- |
| Shapeoko 4 Standard | 17,5″ × 17,5″ × 4″ (445 × 445 × 102 mm) | Correia, rodas em V | Router de 65 mm |
| Shapeoko 4 XL | 33″ × 17,5″ × 4″ (838 × 445 × 102 mm) | Correia | Router de 65 mm |
| Shapeoko 4 XXL | 33″ × 33″ × 4″ (838 × 838 × 102 mm) | Correia | Router de 65 mm |
| Shapeoko Pro (Std/XL/XXL) | Os mesmos cursos da 4 | Correia, trilhos lineares | Router de 65 mm |
| Shapeoko 5.1 Pro 2×2 | 24,53″ × 24,53″ × 6,1″ (623 × 623 × 155 mm) | Fuso de esferas | Router ou spindle VFD de 65 mm |
| Shapeoko 5.1 Pro 4×2 | 48,7″ × 24,53″ × 6,1″ (1237 × 623 × 155 mm) | Fuso de esferas | Router ou spindle VFD de 65 mm |
| Shapeoko 5.1 Pro 4×4 | 48,7″ × 48,7″ × 6,1″ (1237 × 1237 × 155 mm) | Fuso de esferas | Router ou spindle VFD de 65 mm |
| Shapeoko HDM | 690 × 610 × 145 mm | Fuso de esferas | Spindle VFD refrigerado a água |
| Nomad 3 (mesa) | 8″ × 8″ × 3″ (203 × 203 × 76 mm) | Fechada | Spindle próprio de 130 W |

Antes de publicar, é preciso confirmar as velocidades máximas ($110–112) com os perfis do Carbide Motion. Elas não estão nas páginas públicas.

### Cabeçotes

- **Carbide Compact Router** (manual, dial de 1 a 6). A tabela da loja dá 1 ≈ 11.000, 2 ≈ 13.500, 3 ≈ 18.250, 4 ≈ 24.500, 5 ≈ 29.250 e 6 ≈ 31.000 rpm. A tabela antiga do fórum é diferente (1 = 10.000 até 6 = 32.000, com meios pontos), então vale usar a da loja e mostrar o número do dial como hoje fazemos com a Makita.
- **Makita RT0701C**, aceita como alternativa nas máquinas de 65 mm. Já existe no catálogo.
- **Carbide VFD Spindle**: rotação por G-code (S), como o AutoSpin.

### Fresas Carbide 3D

Fresas como #201 (1/4″ reta, que vem com a máquina), #102 (1/8″), #112 (1/16″), #301 (V de 90°) e #302 (V de 60°) seguem a mesma regra de compatibilidade por haste e pinça. Os números e diâmetros precisam ser conferidos na loja antes de entrar no catálogo; não copiamos a tabela de avanços da Carbide. Para Shapeoko usamos valores calculados por carga de cavaco e rigidez da máquina (correia vs fuso de esferas), marcados como "valores calculados" (o aviso `NO_SIENCI_TABLE` já cobre isso).

### Projetos iniciais

Os 7 projetos atuais já se ajustam ao curso da máquina (`projectsForMachine`), então valem para Shapeoko sem mudança. Só muda o texto de "primeiro corte", que deve citar o BitSetter quando a máquina tiver.

### Cuidados

- **Marca e imagens:** citar "compatível com Shapeoko" é uso nominativo. Não usar logotipo nem fotos da Carbide 3D.
- **Relação com a Sienci:** se o produto for oferecido à Sienci, a inclusão de outras marcas pode incomodar. Vale deixar isso configurável no build (`MARCAS=sienci` ou `MARCAS=todas`).

## Situação (atualizada depois dos passos 2 e 3)

Feito:

- **Formas:** polígono regular e estrela, ao lado de retângulo, círculo e linha.
- **Texto em arco:** controle "Curve" de −100% a 100% (meia volta).
- **Offset de vetor:** "Thicker / thinner" engrossa ou afina qualquer elemento; "Outline ring" acrescenta um anel em volta a uma distância escolhida.
- **Booleanas:** união automática entre elementos que se tocam. "Subtract" tira a forma do elemento dos outros (por exemplo, uma lua). "Mask" faz os outros ficarem só com a parte de dentro.
- **Alinhar e distribuir:** Shift+clique seleciona vários. Dá para alinhar à seleção, ou à placa quando há um só elemento, e distribuir quando há 3 ou mais. Arrastar move o grupo.
- **Importar DXF:** junto com o SVG, pelo mesmo botão e por arrastar o arquivo. Lê linhas, polilinhas com arco, círculos, arcos, elipses e splines, com unidades.
- **V-carve de verdade:** a profundidade acompanha a largura do traço. O valor de profundidade vira o limite. Onde o traço passaria do limite, o fundo fica plano e aparece o aviso `VCARVE_FLAT_BOTTOM`.
- **Hachura** (recurso do Pro): "Outline + lines" em vez de esvaziar a área gravada, com espaçamento e ângulo.

Ainda falta para igualar o Core: ferramenta de curvas Bézier livre, imagem de fundo para decalcar, vetorização automática de imagem e uma biblioteca maior de elementos. O "Subtract" vale para todos os elementos que a forma cobre, não para um só.

## 4. Ordem sugerida

Combina com o doc 05 (paridade com o CAMLab):

1. **Catálogo multimarca e Shapeoko** (máquinas, Compact Router, VFD, fresas e marca no seletor). É pequeno e destrava os donos de Shapeoko.
2. **Paridade com o Core no desenho:** offset, booleanas na interface, alinhar e distribuir, polígono e estrela, texto em arco e DXF.
3. **V-carve de verdade** (eixo medial e profundidade variável), mais hachura. É o recurso mais visível que falta.
4. Fase 1 do doc 05: parâmetros editáveis no modo Pro, rampa, origem e salvar/abrir projeto.
5. Imagem de fundo e vetorização automática.
6. Fases 2 e 3 do doc 05 (3D, STL, imagem como relevo) e divisão em partes.

Ao fim do passo 3, igualamos o Core em tudo, exceto vetorização de imagem, e ainda geramos G-code para qualquer máquina GRBL, que no Carbide Create exige o Pro.
