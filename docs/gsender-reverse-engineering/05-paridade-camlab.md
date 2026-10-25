# Paridade com o CAMLab

O CAMLab é o CAM 3D da Sienci, roda no navegador e é **baseado no Kiri:Moto** (Stewart Allen). Fontes: a captura de tela do CAMLab, a página [Choosing Software](https://resources.sienci.com/view/lmk2-choosing-software/), a [documentação de operações do Kiri:Moto](https://docs.grid.space/kiri-moto/CAM/ops/) e o repositório [GridSpace/grid-apps](https://github.com/gridspace/grid-apps) (**licença MIT**).

## Recurso por recurso

| CAMLab | Para quê | Nós hoje | O que falta |
|---|---|---|---|
| **MACHINE** | Escolher a máquina | ✅ Catálogo Sienci com curso e velocidades reais | — |
| **IMPORT +** (STL, várias peças) | Trazer modelos 3D | ❌ | Importar STL (e SVG, já planejado) |
| **Material Size** X×Y×Z | Bloco | ✅ Bloco calculado da peça + margem | Bloco livre, maior que a peça |
| **Positioning:** origin center / origin top / snap to top / z top offset / z segment | Onde fica o zero | ⚠️ Fixo: canto inferior esquerdo, face de cima | Origem no centro, offset de Z no topo, "snap to top" para STL |
| **TOOLS** (biblioteca) | Escolher a fresa | ✅ Fresas Sienci com compatibilidade | Usar ball nose (hoje bloqueada por ser 3D) |
| **ARRANGE** | Várias peças no bloco | ❌ (uma peça por projeto) | Arranjo/aninhamento de peças |
| **GENERATE / EXPORT** | Gerar e salvar o G-code | ✅ Gera, **verifica** e baixa o .nc | — |
| **Settings load/save** | Salvar configurações e projeto | ⚠️ Salvo só no navegador | Salvar/abrir arquivo de projeto |
| **Path Alterations:** pocket only / depth first / clockwise | Ajuste fino do percurso | ⚠️ "Pocket only" ≈ sem recorte externo; sentido existe no motor mas não aparece na tela; profundidade primeiro não existe | Expor no modo Pro |
| **ROUGHING** | Desbaste 3D | ❌ | CAM 3D |
| **FINISHING** (step down, feed, plunge) | Acabamento | ⚠️ 2.5D sim, com valores da tabela Sienci; o Pro mostra mas não deixa editar | Campos editáveis no Pro; acabamento 3D |
| **RELIEF** | Relevo 3D | ❌ (só relevo 2.5D de letras e formas) | Acabamento 3D com ball nose |
| **DRILLING** | Furação | ✅ Furos em bicadas ou pocket | Detectar furos num STL |
| **CUTOUT TABS** | Abas de fixação | ✅ Quantidade e altura | Posicionar abas à mão |
| **FEEDS** | Avanço e rotação | ✅ **Melhor:** tabela oficial Sienci por fresa e material | — |
| **?** (ajuda) | Ajuda | ✅ Vídeos por etapa (falta preencher os links) | — |
| Prévia / animação | Ver antes de cortar | ✅ **Melhor:** simulação da remoção de material em 2D/3D | Prévia 3D de STL |

**Onde já somos melhores:** desenho de placas e letreiros sem outro programa, avisos que dizem o que fazer, tabela oficial de velocidades, compatibilidade fresa × router, simulação do corte, verificador de G-code e o fluxo completo até cortar.

**Onde estamos atrás:** tudo que começa num **STL** (importar, desbaste 3D, acabamento 3D/relevo, arranjo) e parte do ajuste fino (origem, ordem dos passes, valores editáveis).

## Como chegar à paridade

### Fase 1: ajustes 2.5D (pequeno, dias)
- **Modo Pro editável:** avanço, mergulho, passada, sobreposição e RPM (o motor já aceita `corte` como sobrescrita).
- **Sentido do corte** (concordante/convencional; o motor já tem `direcao`) e **profundidade primeiro** (cada elemento até o fundo antes de ir para o próximo).
- **Origem no centro** e offset de Z no topo (o pós-processador só desloca as coordenadas; o verificador acompanha).
- **Bloco livre**, maior que a peça.
- **Salvar/abrir projeto** (`.gsproj`, JSON da especificação) e exportar só o G-code.

### Fase 2: STL e 3D com o motor do Kiri:Moto (médio, semanas)
- **Por que o Kiri:Moto:** é o que o próprio CAMLab usa. Tem licença MIT e uma **API de engine que roda num Web Worker** (`kiri.newEngine().load(stl).setMode("CAM").setStock().setTools().setProcess({ops}).slice().prepare().export()`), com as operações Rough, Outline, Contour (acabamento X/Y), Level, Drill, Trace e Pocket. Refazer CAM 3D do zero seria meses de trabalho.
- **Integração:**
  - Em Criar, uma opção "Peça 3D (STL)": importar, escalar, girar e "snap to top".
  - Fresas de desbaste e de acabamento escolhidas entre as fresas Sienci; a ball nose passa a ser liberada.
  - Velocidades da tabela Sienci (que já tem linhas de ball nose para acabamento).
- **O que continua nosso:**
  - O G-code do Kiri passa pelo **nosso verificador**.
  - A prévia usa a **nossa simulação**, que precisa aprender o formato da ball nose.
  - Preparar, Posicionar e Cortar continuam iguais.
- **Risco:** o fórum do Kiri:Moto relata bugs na API da engine (roughing que depende de outline, origem exigindo chamadas extras). O plano é fixar uma versão, cobrir com testes de aceite (como já fazemos com a placa "Casa da Ana") e reportar ou corrigir upstream.

### Fase 3: arranjo e extras
- Várias peças num bloco (arranjo manual e depois automático) e abas posicionadas à mão.
- Imagem → relevo (mapa de profundidade) como evolução do relevo 3D.

## Ordem sugerida, junto com o que já foi pedido
1. Modo gControl (em andamento)
2. Importador de SVG
3. Paridade fase 1 (ajustes 2.5D)
4. Paridade fase 2 (STL + 3D via Kiri:Moto)
5. Fase 3
