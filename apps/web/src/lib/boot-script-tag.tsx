'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * The inline boot script in <head>. It only has to run from the server HTML. When React renders
 * it on the client (a locale switch remounts <html>), a script would never run and React warns
 * about it, so there it becomes an inert data block; Providers re-applies the boot state instead.
 */
export function BootScriptTag({ code }: { code: string }) {
  const onClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <script type={onClient ? 'text/plain' : undefined} dangerouslySetInnerHTML={{ __html: code }} />
  );
}
