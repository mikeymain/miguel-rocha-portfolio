import { runFinderSearch } from "./engine/buildFinder";

// Runs a finder search in a Web Worker so the page stays responsive and the
// search can be stopped. Falls back to an on-page search when the worker
// cannot load, for example in a tab opened before a deploy. An on-page
// search cannot be interrupted, but its result is ignored after stop().
export function startFinderSearch(input, { onResult, onError }) {
  let worker = null,
    stopped = false;
  const fail = (error) => {
    console.error(error);
    onError(
      `The finder could not complete this search (${error?.message || String(error)}). Reload the page and try again.`,
    );
  };
  const searchInline = () =>
    window.setTimeout(() => {
      if (stopped) return;
      let result;
      try {
        result = runFinderSearch(input);
      } catch (error) {
        fail(error);
        return;
      }
      if (!stopped) onResult(result);
    }, 30);
  const release = () => {
    worker?.terminate();
    worker = null;
  };
  try {
    worker = new Worker(new URL("./engine/finderWorker.js", import.meta.url), { type: "module" });
  } catch {
    searchInline();
    return {
      stop() {
        stopped = true;
      },
    };
  }
  worker.onmessage = ({ data }) => {
    release();
    if (stopped) return;
    if (data.ok) onResult(data.result);
    else onError(data.error);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    if (!worker) return;
    release();
    searchInline();
  };
  worker.postMessage(input);
  return {
    stop() {
      stopped = true;
      release();
    },
  };
}
