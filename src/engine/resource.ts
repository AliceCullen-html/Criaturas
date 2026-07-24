/**
 * Chave tipada para um "recurso" singleton do mundo (ex.: terreno, clima).
 * Mesma ideia do `ComponentType`, mas para dados únicos, não por entidade.
 */
export interface ResourceKey<T> {
  readonly name: string;
  /** @internal Apenas para inferência de tipos. */
  readonly __type?: T;
}

export function defineResource<T>(name: string): ResourceKey<T> {
  return { name };
}
