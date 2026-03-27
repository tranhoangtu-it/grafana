import { useLayoutEffect, useRef } from 'react';
import uPlot, { Hooks } from 'uplot';

import { UPlotConfigBuilder } from '@grafana/ui';

type DropFirst<T extends unknown[]> = T extends [never, ...infer U] ? U : never;

export function usePlotConfigHook<T extends keyof Hooks.Defs>(
  config: UPlotConfigBuilder,
  hookType: T,
  hookFn?: Hooks.Defs[T],
  destructor?: () => void
): uPlot | null {
  const uplotRef = useRef<uPlot | null>(null);

  useLayoutEffect(() => {
    // We need to assert because Hooks.Defs[T] resolves as the intersection of all the hook defs, so we would need to narrow each Def by T (hook name) to avoid the assertion, which is unnecessarily verbose
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    config.addHook<T>(hookType, ((u: uPlot, ...args: DropFirst<Parameters<NonNullable<Hooks.Defs[T]>>>) => {
      uplotRef.current = u;
      if (hookFn) {
        Reflect.apply(hookFn, undefined, [u, ...args]);
      }
    }) as Hooks.Defs[T]);

    return destructor;
  }, [config, hookFn, hookType, destructor]);

  return uplotRef?.current ?? null;
}
