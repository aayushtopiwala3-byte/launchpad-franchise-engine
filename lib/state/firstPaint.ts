"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * False for the server render and for the client's first pass, true afterwards.
 *
 * Anything restored from this browser — leads, journey progress, the loaded dataset — does not
 * exist when the server renders the page. Painting it on the first client pass would contradict
 * the markup React is hydrating, so callers hold a placeholder until this turns true.
 */
export function useFirstPaint(): boolean {
  return useSyncExternalStore(noopSubscribe, onClient, onServer);
}
