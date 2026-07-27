/**
 * O ovo, na parte que a simulação e o desenho precisam combinar.
 *
 * A eclosão tem duas metades que moram em camadas diferentes: o RELÓGIO é da
 * simulação (quanto falta, o calor da mão, a hora de romper) e a ANIMAÇÃO é do
 * renderer (a casca rachando). O que as duas precisam saber juntas é apenas
 * quando a rachadura começa — e é só isso que está aqui.
 *
 * Ficar em `@core` não é preciosismo: quando este número existia só no
 * renderer, qualquer código da simulação que quisesse "abrir o ovo agora"
 * precisava repetir o 0,8 de memória. Duas cópias de uma constante que precisam
 * concordar é uma delas esperando para ficar errada.
 */

/**
 * Fração da espera em que a casca começa a rachar.
 *
 * Até os últimos vinte por cento o ovo é só um ovo. A rachadura tem de ser
 * NOTÍCIA: um ovo que racha desde o primeiro segundo não avisa nada.
 */
export const EGG_CRACK_AT = 0.8;
