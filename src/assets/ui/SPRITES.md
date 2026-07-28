<!--
  NOTA DE ARQUIVAMENTO — os nomes chegaram trocados.

  Os arquivos vieram do upload com os nomes embaralhados entre si (o próprio
  README chegou como `anim_banho_4x.png`). Foram identificados pelo CONTEÚDO,
  um a um, e renomeados aqui:

    appleBit_4x.png       →  ui/icons.png    15 ícones de 16x16 em 4x, 8 colunas
    atlas_icones_1x.png   →  ui/belt.png     8 ferramentas x 4 estados, 24x24 em 4x
    anim_bola_4x.png      →  anim/bath.png   4 quadros: a espuma na cabeça
    anim_brincando_4x.png →  anim/ball.png   6 quadros: a bola quicando e rolando
    atlas_botoes_1x.png   →  anim/play.png   5 pares (criatura, bola) para compor
    anim_banho_4x.png     →  este arquivo

  As versões 1x e os quinze ícones soltos foram descartados: são a mesma arte do
  atlas, e os nomes soltos também estavam trocados. O jogo lê tudo dos atlas em
  4x e reduz na hora de recortar, como já faz com a folha do Tintim.
-->

# Sprites do cinto — Tintim

Paleta:
K = #241A12
W = #FFF6E0
R = #C2402F
r = #8E2A20
G = #5A8C3A
S = #6B4A2E
b = #3E6FA8
B = #6FA0D0
y = #E8C860
Y = #B89830
c = #F2E3C0
C = #7ACBD0
e = #3E6B3A
E = #5C8F4A
o = #E0B040
O = #F5D878
p = #D2566A
P = #F090A0
t = #E8B888
T = #C08A5A
w = #8B6239
d = #6B4A2E
D = #3E2A18
m = #8A9490
M = #B6C0BA
n = #4E5C5C
f = #E07AA0
g = #9AA0A8
h = #6E665A

## Arquivos
- atlas_icones_1x.png / _4x.png — 15 ícones 16x16, grade de 8 colunas, nesta ordem:
  apple, ball, sponge, gift, book, egg, heart, hand, appleBit, appleCore, bear, flower, pillow, rock, feather
- atlas_botoes_1x.png / _4x.png — 8 ferramentas (linhas) x 4 estados (colunas: normal, hover, press, disabled), célula 24x24
- icones/<nome>_4x.png — ícone solto, fundo transparente

## Convenções
- Ícone 16x16 centralizado no slot 24x24, offset (4,4).
- Estado press desloca o ícone 1px para baixo.
- Cursor: ícone 16x16 em 2x, hotspot no centro (16,16).
- Fundo transparente, sem anti-aliasing (nearest neighbor na engine).
