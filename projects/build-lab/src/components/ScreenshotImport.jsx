import { useEffect, useState } from "react";
import { attributes, formatHeight } from "../data.js";
import { buildFromScreenshot, readBuildScreenshot } from "../screenshotReader.js";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const numberOrNull = (value) => (value === "" ? null : Number(value));

// Read a 2K "Attribute Upgrades" screenshot, let the user check every value,
// then hand back a build.
export function ScreenshotImport({ onImport }) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [read, setRead] = useState(null);

  async function readFile(file) {
    if (!file?.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    setError("");
    setRead(null);
    setStatus("Reading screenshot…");
    try {
      setRead(
        await readBuildScreenshot(file, (progress) =>
          setStatus(`Reading screenshot… ${Math.round(progress * 100)}%`),
        ),
      );
      setStatus("");
    } catch (failure) {
      setStatus("");
      setError(failure.message || "The screenshot could not be read.");
    }
  }
  useEffect(() => {
    const paste = (event) => {
      const file = [...(event.clipboardData?.files || [])].find((item) =>
        item.type.startsWith("image/"),
      );
      if (file) readFile(file);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, []);

  const setBody = (key, value) =>
    setRead((current) => ({ ...current, body: { ...current.body, [key]: value } }));
  const setRating = (group, id, value) =>
    setRead((current) => ({
      ...current,
      [group]: { ...current[group], [id]: numberOrNull(value) },
    }));
  const missing = read
    ? [
        ...["position", "height", "weight", "wingspan"].filter((key) => read.body[key] == null),
        ...attributes
          .filter((a) => read.base[a.id] == null || read.finals[a.id] == null)
          .map((a) => a.name),
      ]
    : [];

  function submit(event) {
    event.preventDefault();
    if (missing.length) {
      setError(`Fill in: ${missing.join(", ")}.`);
      return;
    }
    const finals = Object.fromEntries(
      attributes.map((a) => [a.id, Math.max(read.finals[a.id], read.base[a.id])]),
    );
    try {
      onImport(buildFromScreenshot({ body: read.body, base: read.base, finals }));
    } catch (failure) {
      setError(failure.message);
    }
  }

  return (
    <div className="screenshot-import">
      <h3>Read a 2K screenshot</h3>
      <p className="muted">
        Use a full 16:9 screenshot of the MyCareer Attribute Upgrades screen. Choose a file or paste
        the image. Check the values before loading.
      </p>
      <label className="form-label">
        Screenshot
        <input
          type="file"
          accept="image/*"
          onChange={(event) => readFile(event.target.files?.[0])}
        />
      </label>
      {status && (
        <p className="form-help" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="negative" role="alert">
          {error}
        </p>
      )}
      {read && (
        <form onSubmit={submit}>
          <div className="screenshot-body">
            <label>
              Position
              <select
                value={read.body.position || ""}
                onChange={(event) => setBody("position", event.target.value || null)}
              >
                <option value="">—</option>
                {POSITIONS.map((position) => (
                  <option key={position}>{position}</option>
                ))}
              </select>
            </label>
            <label>
              Height (in)
              <input
                type="number"
                min="69"
                max="88"
                value={read.body.height ?? ""}
                onChange={(event) => setBody("height", numberOrNull(event.target.value))}
              />
              <small>{read.body.height ? formatHeight(read.body.height) : ""}</small>
            </label>
            <label>
              Weight (lbs)
              <input
                type="number"
                min="145"
                max="350"
                value={read.body.weight ?? ""}
                onChange={(event) => setBody("weight", numberOrNull(event.target.value))}
              />
            </label>
            <label>
              Wingspan (in)
              <input
                type="number"
                min="69"
                max="99"
                value={read.body.wingspan ?? ""}
                onChange={(event) => setBody("wingspan", numberOrNull(event.target.value))}
              />
              <small>{read.body.wingspan ? formatHeight(read.body.wingspan) : ""}</small>
            </label>
          </div>
          <div
            className="screenshot-ratings"
            role="table"
            aria-label="Ratings read from the screenshot"
          >
            {[0, 1].map((column) => (
              <div
                role="row"
                key={column}
                className="screenshot-ratings-head"
                aria-hidden={column === 1 || undefined}
              >
                <span>Attribute</span>
                <span>Base</span>
                <span>After caps</span>
              </div>
            ))}
            {attributes.map((a) => (
              <div
                role="row"
                key={a.id}
                className={
                  read.base[a.id] == null || read.finals[a.id] == null ? "screenshot-missing" : ""
                }
              >
                <span>{a.name}</span>
                <input
                  type="number"
                  min="25"
                  max="99"
                  aria-label={`${a.name} base`}
                  value={read.base[a.id] ?? ""}
                  onChange={(event) => setRating("base", a.id, event.target.value)}
                />
                <input
                  type="number"
                  min="25"
                  max="99"
                  aria-label={`${a.name} after caps`}
                  value={read.finals[a.id] ?? ""}
                  onChange={(event) => setRating("finals", a.id, event.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button className="primary" type="submit">
              Load build
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
