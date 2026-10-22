import { runFinderSearch } from "./buildFinder.js";

// Runs the finder off the main thread so the page stays responsive and a
// search can be stopped by terminating this worker.
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ ok: true, result: runFinderSearch(data) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: `The finder could not complete this search (${error?.message || String(error)}). Reload the page and try again.`,
    });
  }
};
