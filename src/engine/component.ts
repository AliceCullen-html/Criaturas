/**
 * Token tipado que identifica um componente. Carrega o tipo `T` no nível de
 * tipos (via `__type`, nunca lido em runtime) para dar segurança às chamadas
 * `world.store(Type)` sem casts pelo código de simulação.
 */
export interface ComponentType<T> {
  readonly name: string;
  /** @internal Apenas para inferência de tipos. */
  readonly __type?: T;
}

export function defineComponent<T>(name: string): ComponentType<T> {
  return { name };
}
