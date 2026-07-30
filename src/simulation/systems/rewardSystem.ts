import { INTENT, clamp01 } from '@core';
import type { System } from '@engine';
import { Creature, Emotions, Habits, Mind, Needs } from '@creatures';

/**
 * O QUE VALEU A PENA — a criatura aprendendo com a própria vida.
 *
 * Este sistema não sabe o que é comer, brincar ou fugir. Ele sabe uma coisa só:
 * medir se a criatura está melhor ou pior do que estava, e creditar a diferença
 * na conta do que ela estava fazendo. Nada mais.
 *
 * É de propósito que ele seja tão burro. Um sistema que soubesse que "comer com
 * fome é bom" estaria escrevendo o comportamento à mão — e o que se pede aqui é
 * o contrário: que o comportamento SAIA da experiência. Comer com fome faz o
 * bem-estar subir, e é só por isso que `seekFood` sobe junto; vagar com fome faz
 * descer, e é só por isso que `wander` desce. A mesma conta, sem nenhuma
 * exceção escrita, produz uma criatura que come quando tem fome — e produziria
 * outra coisa num jardim em que comer fizesse mal.
 *
 * DUAS CRIATURAS IGUAIS VIRAM DUAS CRIATURAS DIFERENTES. Este é o efeito que
 * importa. Antes, o que separava duas irmãs de mesmo genoma era só a lembrança
 * dos objetos: no resto, decidiam igual a vida inteira, porque a conta da
 * utilidade era a mesma conta. Agora cada uma carrega o saldo do que deu certo
 * PARA ELA. Uma que teve sorte procurando comida vira uma que procura comida; a
 * que passou fome tentando, vira outra coisa.
 *
 * O julgamento é por TRECHO, não por quadro. Uma intenção começa, dura o tempo
 * dela, e no fim se pergunta "saí melhor do que entrei?". Medir quadro a quadro
 * daria crédito à intenção errada — a felicidade de ter comido chega segundos
 * depois da mordida, quando ela já saiu andando.
 */

/**
 * Quanto dura um capricho.
 *
 * Dezoito segundos: mais que a travessia do jardim, que é o que importa — dentro
 * de uma ida até em casa a inclinação dela não muda, e ela chega. Menos que uma
 * rotina inteira, para o bicho não passar a vida com a mesma mania.
 */
const CAPRICHO = 18;

/** Trechos mais curtos que isto não são julgados: são um piscar de olhos. */
const MINIMO = 2.5;
/** E mais longos que isto são fechados no meio, para o crédito não demorar demais. */
const MAXIMO = 25;
/**
 * O quanto uma experiência nova pesa contra tudo o que já viveu.
 *
 * Um sexto: são umas seis experiências até a opinião virar, o que em tempo de
 * jardim é alguns minutos. Rápido o bastante para o jogador ver a criatura
 * mudando de hábito; devagar o bastante para um dia ruim não apagar uma vida.
 */
const PESO_NOVO = 1 / 6;
/**
 * O ganho de bem-estar que já conta como uma experiência ótima.
 *
 * Um quinto: matar a fome inteira num trecho é isso, mais ou menos. Sem um teto,
 * um único evento enorme — nascer, ser curada — mandaria na conta para sempre.
 */
const GANHO_CHEIO = 0.2;
/**
 * O quanto a linha de base se move a cada trecho julgado.
 *
 * Um quarto: ela acompanha a fase da vida da criatura sem virar a própria
 * medida. Se subisse depressa demais, a linha de base grudaria em cada trecho e
 * a diferença seria sempre zero — nada seria bom nem ruim.
 */
const DERIVA = 0.25;
/**
 * O QUANTO A OPINIÃO VOLTA AO MEIO, por segundo.
 *
 * Sem isto o sistema se engole. Medido, com o mesmo jardim e a mesma semente,
 * ligando e desligando só a recompensa: sem ela o jardim tinha estudo 14,
 * seguir 10, conviver 5, dividir 4, dormir 4, vagar, observar, brigar, brincar;
 * com ela, trinta e três das sessenta e quatro criaturas estavam cortejando e o
 * resto seguindo. É a armadilha clássica do reforço ingênuo: o que dá certo é
 * escolhido mais, o que é escolhido mais é creditado mais, e em meia hora o
 * jardim inteiro faz uma coisa só.
 *
 * Uma opinião que volta devagar ao meio obriga o hábito a se PAGAR de novo para
 * continuar de pé, e devolve à criatura o direito de experimentar outra coisa.
 * A meia-vida é de uns três minutos de jardim: o suficiente para uma preferência
 * durar uma fase da vida, e não a vida inteira.
 */
const ESQUECE = 0.004;

export const rewardSystem: System = {
  name: 'reward',
  update(world, dt) {
    if (!world.hasComponent(Habits)) return;
    const habits = world.store(Habits);
    const minds = world.store(Mind);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);

    world.store(Creature).forEach((_tag, entity) => {
      const habit = habits.get(entity);
      const mind = minds.get(entity);
      const needs = needsStore.get(entity);
      const emotions = emotionsStore.get(entity);
      if (!habit || !mind || !needs || !emotions) return;

      // O CAPRICHO DO MOMENTO, trocado devagar. Mora aqui porque este é o
      // sistema que já cuida do que a criatura aprende e sente sobre o que faz.
      habit.whimIn -= dt;
      if (habit.whimIn <= 0) {
        habit.whim = world.rng.next();
        habit.whimIn = CAPRICHO;
      }

      // A OPINIÃO DESBOTA. Ver `ESQUECE`: sem isto o hábito vencedor se
      // realimenta até o jardim inteiro fazer uma coisa só.
      for (let i = 0; i < habit.value.length; i++) {
        const v = habit.value[i] ?? 0.5;
        habit.value[i] = v + (0.5 - v) * ESQUECE * dt;
      }

      const agora = estar(needs, emotions);
      const atual = INTENT[mind.intent];

      // Trocou de intenção, ou o trecho ficou longo demais: hora de julgar.
      if (habit.judging !== atual || habit.elapsed >= MAXIMO) {
        if (habit.judging >= 0 && habit.elapsed >= MINIMO) {
          const saldo = agora - habit.since;
          // CONTRA A LINHA DE BASE, e não contra zero: o que interessa é o que
          // a escolha acrescentou à vida que ela já estava tendo.
          creditar(habit, habit.judging, saldo - habit.drift * habit.elapsed);
          const porSegundo = saldo / habit.elapsed;
          habit.drift += (porSegundo - habit.drift) * DERIVA;
        }
        habit.judging = atual;
        habit.since = agora;
        habit.elapsed = 0;
        return;
      }
      habit.elapsed += dt;
    });
  },
};

/**
 * Como a criatura está agora, de 0 a 1.
 *
 * Corpo e cabeça na mesma conta, porque é assim que ela sente: barriga cheia com
 * medo não é estar bem. Os pesos não são finos — o que importa é a DIREÇÃO da
 * mudança, e essa é a mesma com qualquer peso razoável.
 */
function estar(
  needs: { hunger: number; thirst: number; energy: number; health: number },
  emotions: { happiness: number; fear: number; stress: number; pain: number; loneliness: number },
): number {
  const corpo =
    (1 - needs.hunger) * 0.3 + (1 - needs.thirst) * 0.25 + needs.energy * 0.15 + needs.health * 0.3;
  const cabeca =
    emotions.happiness * 0.5 +
    (1 - emotions.fear) * 0.2 +
    (1 - emotions.stress) * 0.1 +
    (1 - emotions.pain) * 0.1 +
    (1 - emotions.loneliness) * 0.1;
  return clamp01(corpo * 0.55 + cabeca * 0.45);
}

/** Mistura a experiência nova na opinião antiga. */
function creditar(
  habit: { value: number[]; tries: number[] },
  intent: number,
  delta: number,
): void {
  // O saldo do trecho vira uma nota de 0 a 1: piorou muito = 0, melhorou muito
  // = 1, ficou igual = meio. É o "meio" que faz a diferença — uma intenção que
  // não muda nada não é ruim, é indiferente, e não deve afundar.
  const nota = clamp01(0.5 + delta / (GANHO_CHEIO * 2));
  const antes = habit.value[intent] ?? 0.5;
  // As primeiras experiências pesam mais: quem nunca tentou nada aprende
  // depressa, e quem já viveu muito não muda de opinião com um dia ruim.
  const tries = habit.tries[intent] ?? 0;
  const peso = Math.max(PESO_NOVO, 1 / (tries + 1));
  habit.value[intent] = antes + (nota - antes) * peso;
  habit.tries[intent] = tries + 1;
}
