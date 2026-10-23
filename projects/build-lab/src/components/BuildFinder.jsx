import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowRight,
  ArrowUUpLeft,
  MagnifyingGlass,
  Stop,
  Minus,
  Plus,
  LockKey,
  LockKeyOpen,
} from "@phosphor-icons/react";
import { attributes, byId, groups, formatHeight } from "../data";
import {
  badgeTargetPlan,
  capBudgetTotal,
  finderTargetLimits,
  finderTargetMaximums,
  nextBadgeThreshold,
  getFinderHeights,
  validateFinderRequest,
} from "../engine/buildFinder";
import { badges } from "../catalogs";
import { startFinderSearch } from "../finderClient";
import { capProjection, projectedRatings } from "../engine/capProjections";
import { buildCaps } from "../engine/buildModel";
import { CategoryIcon } from "./CategoryIcon";

const badgeTiers = ["Bronze", "Silver", "Gold", "Hall Of Fame"];
const badgeNamesByGroup = groups
  .map((group) => ({
    group,
    names: [
      ...new Set(badges.filter((item) => item.group === group.id).map((item) => item.name)),
    ].sort((a, b) => a.localeCompare(b, "en")),
  }))
  .filter((entry) => entry.names.length);
const editorColumns = [
  ["fin", "reb"],
  ["sht", "def"],
  ["plm", "phy"],
].map((ids) => ids.map((id) => groups.find((group) => group.id === id)));

const CAP_STEPS = 5;

// Gain of each cap-breaker step on this spread, trimmed at the body ceiling.
function capSteps(build, id, count = CAP_STEPS) {
  if (!count) return [];
  const ceiling = buildCaps(build.body)[id] ?? 99;
  let rating = build.ratings[id];
  return capProjection(build, id)
    .gains.slice(0, count)
    .map((gain) => {
      const next = Math.min(ceiling, rating + gain),
        applied = next - rating;
      rating = next;
      return applied;
    });
}

function resultRows(result) {
  const finals = projectedRatings(result.build).ratings,
    targets = new Map(result.capTargets.map((item) => [item.id, item]));
  return attributes.map((attribute) => {
    const target = targets.get(attribute.id);
    return {
      id: attribute.id,
      name: attribute.name,
      group: attribute.group,
      base: result.build.ratings[attribute.id],
      caps: Number(result.build.breakers?.[attribute.id]) || 0,
      steps: capSteps(
        result.build,
        attribute.id,
        Number(result.build.breakers?.[attribute.id]) || 0,
      ),
      final: target?.final ?? finals[attribute.id],
      met: target?.met,
      must: target?.must,
      focused: Boolean(target),
      target: target?.target,
    };
  });
}

function clampTargets(ratings, maximums) {
  return Object.fromEntries(
    attributes.map((attribute) => [
      attribute.id,
      Math.min(ratings[attribute.id], maximums[attribute.id]),
    ]),
  );
}

function DesiredRating({ id, name, value, max, onChange }) {
  const [draft, setDraft] = useState(String(value));
  // Reset the draft when the committed value changes from outside.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(String(value));
  }
  function commit() {
    if (draft.trim() === "") {
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.max(25, Math.min(max, Math.round(parsed)));
    setDraft(String(next));
    onChange(next);
  }
  return (
    <input
      id={`target-${id}-value`}
      className="rating"
      type="number"
      min="25"
      max={max}
      aria-label={`Desired ${name} after caps`}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(String(value));
      }}
    />
  );
}

// Five cap breakers on every attribute: no budget limit.
const UNLIMITED_CAPS = 5 * attributes.length;

export function BuildFinder({ referenceBuild, onBack, onOpenBuild }) {
  // Build around the cap budget, or find the fewest cap breakers the targets need.
  const [fewestCaps, setFewestCaps] = useState(false);
  const objective = fewestCaps ? "minimizeCaps" : "maximizePriorities";
  const [minHeight, setMinHeight] = useState(referenceBuild.body.height);
  const [maxHeight, setMaxHeight] = useState(referenceBuild.body.height);
  const [capBreakerCount, setCapBreakerCount] = useState(
    String(
      Object.values(referenceBuild.breakers || {}).reduce(
        (sum, count) => sum + (Number(count) || 0),
        0,
      ),
    ),
  );
  const [targetRatings, setTargetRatings] = useState(() =>
    clampTargets(
      projectedRatings(referenceBuild).ratings,
      finderTargetMaximums({
        minHeight: referenceBuild.body.height,
        maxHeight: referenceBuild.body.height,
      }),
    ),
  );
  const [specializationCount, setSpecializationCount] = useState("0");
  const [specialization, setSpecialization] = useState("");
  const [results, setResults] = useState(null);
  const resultRowSets = useMemo(() => results?.results.map(resultRows) || [], [results]);
  const [errors, setErrors] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState("");
  const searchRef = useRef(null);
  useEffect(() => () => searchRef.current?.stop(), []);
  // Targets are Must by default; ids here are best effort instead.
  const [bestEffort, setBestEffort] = useState(() => new Set());
  const [badgeName, setBadgeName] = useState("");
  const [badgeTier, setBadgeTier] = useState("Bronze");
  const [badgeNote, setBadgeNote] = useState("");
  // Priority for Must limits, most recently edited first.
  const [editOrder, setEditOrder] = useState(() => attributes.map((attribute) => attribute.id));
  const rangeMaximums = useMemo(
    () => finderTargetMaximums({ minHeight, maxHeight }),
    [minHeight, maxHeight],
  );
  const limited = useMemo(
    () =>
      finderTargetLimits({ minHeight, maxHeight }, targetRatings, {
        mustIds: new Set(
          attributes.map((attribute) => attribute.id).filter((id) => !bestEffort.has(id)),
        ),
        order: editOrder,
      }),
    [minHeight, maxHeight, targetRatings, bestEffort, editOrder],
  );
  const maximums = limited.limits;
  useEffect(() => {
    const lowered = attributes.filter(
      (attribute) => limited.ratings[attribute.id] < targetRatings[attribute.id],
    );
    if (!lowered.length) return;
    setTargetRatings(limited.ratings);
    setBadgeNote(
      `Lowered to fit your other Musts: ${lowered.map((attribute) => `${attribute.name} ${targetRatings[attribute.id]} → ${limited.ratings[attribute.id]}`).join(", ")}.`,
    );
  }, [limited]);
  const tierOptions = badgeTiers.filter((tier) =>
    badges.some((item) => item.name === badgeName && item.tier === tier),
  );

  const capTargets = attributes
    .filter((attribute) => targetRatings[attribute.id] > 25)
    .map((attribute) => ({
      id: attribute.id,
      target: targetRatings[attribute.id],
      must: !bestEffort.has(attribute.id),
    }));
  const heights = getFinderHeights();
  const prioritize = (ids) =>
    setEditOrder((order) => [...ids, ...order.filter((id) => !ids.includes(id))]);
  // An edited target may go up to the best body in the height range; Musts
  // edited earlier then come down to what bodies with this target can reach.
  function setDesiredRating(id, value) {
    prioritize([id]);
    setTargetRatings((ratings) => ({
      ...ratings,
      [id]: Math.max(25, Math.min(rangeMaximums[id], value)),
    }));
    setResults(null);
  }
  // Targets never exceed what the best body in the new height range can reach.
  function changeHeights(min, max) {
    setMinHeight(min);
    setMaxHeight(max);
    setTargetRatings((ratings) =>
      clampTargets(ratings, finderTargetMaximums({ minHeight: min, maxHeight: max })),
    );
    setResults(null);
  }
  function addBadgeTarget() {
    const item = badges.find(
      (candidate) => candidate.name === badgeName && candidate.tier === badgeTier,
    );
    const plan = badgeTargetPlan(item, targetRatings, { minHeight, maxHeight });
    if (plan.error) {
      setBadgeNote(plan.error);
      return;
    }
    prioritize(plan.requirements.map((requirement) => requirement.id));
    setTargetRatings(plan.targets);
    setBestEffort(
      (ids) =>
        new Set(
          [...ids].filter((id) => !plan.requirements.some((requirement) => requirement.id === id)),
        ),
    );
    setResults(null);
    setBadgeNote(
      `${item.name} ${item.tier}: ${plan.requirements.map((requirement) => `${requirement.value} ${byId[requirement.id].name}`).join(" + ") || "no rating needed"} set as Must.`,
    );
  }
  function applyReachedTargets(result) {
    setTargetRatings((ratings) => ({
      ...ratings,
      ...Object.fromEntries(result.misses.map((miss) => [miss.id, Math.max(25, miss.final)])),
    }));
    setResults(null);
    setBadgeNote(
      `Targets lowered to what this build reaches: ${result.misses.map((miss) => `${miss.final} ${miss.name}`).join(", ")}.`,
    );
  }
  // A new Must yields to the Musts already set.
  function toggleMust(id) {
    setEditOrder((order) => [...order.filter((other) => other !== id), id]);
    setBestEffort((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setResults(null);
  }
  function request() {
    return {
      objective,
      minHeight,
      maxHeight,
      ...(fewestCaps
        ? { capBreakerCount: UNLIMITED_CAPS, specializationCount: 0, specialization: null }
        : {
            capBreakerCount: Number(capBreakerCount),
            specializationCount: Number(specializationCount),
            specialization: specialization || null,
          }),
      capTargets,
      priorities: [],
      bodyReference: referenceBuild.body,
      startingBuild: referenceBuild,
      limit: 8,
      maxBodyCandidates: 48,
    };
  }
  function search() {
    const input = request(),
      validation = validateFinderRequest(input);
    setErrors(validation);
    setResults(null);
    if (validation.length) return;
    setSearching(true);
    setSearchNote("");
    searchRef.current?.stop();
    const done = () => {
      searchRef.current = null;
      setSearching(false);
    };
    searchRef.current = startFinderSearch(input, {
      onResult: (result) => {
        if (result.errors?.length) setErrors(result.errors);
        else setResults(result);
        done();
      },
      onError: (message) => {
        setErrors([message]);
        done();
      },
    });
  }
  function stopSearch() {
    searchRef.current?.stop();
    searchRef.current = null;
    setSearching(false);
    setSearchNote("Search stopped. Adjust your targets or height range and search again.");
  }

  return (
    <main className="finder-page">
      <div className="finder-heading">
        <div>
          <span className="eyebrow">BUILD LAB · SEARCH</span>
          <h1>Find your build</h1>
          <p>
            Set the ratings you want after cap breakers, then compare legal base builds that can
            reach them.
          </p>
        </div>
        <button className="secondary" onClick={onBack}>
          <ArrowUUpLeft size={18} />
          Back to builder
        </button>
      </div>
      <div className="finder-layout">
        <section className="finder-form" aria-label="Build search settings">
          <div className="finder-section-heading">
            <span className="finder-step">01</span>
            <div>
              <h2>Choose height range and cap budget</h2>
              <p>
                {fewestCaps
                  ? "The finder searches legal positions, weights, and wingspans within this height range and ranks builds by the fewest cap breakers your Must targets need."
                  : "The finder searches legal positions, weights, and wingspans within this height range and spends every cap breaker you have."}
              </p>
            </div>
          </div>
          <div className="finder-body-grid">
            <label>
              From height
              <select
                value={minHeight}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  changeHeights(next, Math.max(next, maxHeight));
                }}
              >
                {heights.map((option) => (
                  <option key={option} value={option}>
                    {formatHeight(option)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To height
              <select
                value={maxHeight}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  changeHeights(Math.min(next, minHeight), next);
                }}
              >
                {heights.map((option) => (
                  <option key={option} value={option}>
                    {formatHeight(option)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cap budget
              <select
                value={fewestCaps ? "fewest" : "budget"}
                onChange={(event) => {
                  setFewestCaps(event.target.value === "fewest");
                  setResults(null);
                }}
              >
                <option value="budget">Use my cap breakers</option>
                <option value="fewest">Fewest needed</option>
              </select>
            </label>
            {!fewestCaps && (
              <>
                <label>
                  Cap breakers available
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={capBreakerCount}
                    onChange={(event) => {
                      setCapBreakerCount(event.target.value);
                      setResults(null);
                    }}
                  />
                </label>
                <label>
                  Specialization
                  <select
                    value={specialization}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next && !specialization) setSpecializationCount("2");
                      setSpecialization(next);
                      setResults(null);
                    }}
                  >
                    <option value="">None</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Specialization breakers
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={specializationCount}
                    disabled={!specialization}
                    title={
                      specialization
                        ? "Usable only on attributes in the selected specialization"
                        : "Choose a specialization to use these breakers"
                    }
                    onChange={(event) => {
                      setSpecializationCount(event.target.value);
                      setResults(null);
                    }}
                  />
                </label>
              </>
            )}
          </div>

          <div className="finder-section-heading finder-section-spaced">
            <span className="finder-step">02</span>
            <div>
              <h2>Desired final ratings</h2>
              <p>
                Set the ratings you want after cap breakers; 25 means no minimum. Targets marked
                Must have to be reached. Switch a target to best effort and the finder gets it as
                close as it can.
              </p>
            </div>
          </div>
          <div className="finder-target-toolbar">
            <span>FINAL ATTRIBUTE TARGETS</span>
            <div className="finder-badge-target" role="group" aria-label="Badge target">
              <select
                aria-label="Badge"
                value={badgeName}
                onChange={(event) => {
                  const name = event.target.value;
                  setBadgeName(name);
                  if (name && !badges.some((item) => item.name === name && item.tier === badgeTier))
                    setBadgeTier(
                      badgeTiers.find((tier) =>
                        badges.some((item) => item.name === name && item.tier === tier),
                      ),
                    );
                  setBadgeNote("");
                }}
              >
                <option value="">Target a badge…</option>
                {badgeNamesByGroup.map(({ group, names }) => (
                  <optgroup key={group.id} label={group.name}>
                    {names.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                aria-label="Badge tier"
                value={badgeTier}
                disabled={!badgeName}
                onChange={(event) => {
                  setBadgeTier(event.target.value);
                  setBadgeNote("");
                }}
              >
                {(badgeName ? tierOptions : badgeTiers).map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="finder-add"
                disabled={!badgeName}
                onClick={addBadgeTarget}
              >
                Add badge
              </button>
            </div>
            <button
              type="button"
              className="finder-add"
              onClick={() => {
                setTargetRatings(
                  Object.fromEntries(attributes.map((attribute) => [attribute.id, 25])),
                );
                setBestEffort(new Set());
                setBadgeNote("");
                setResults(null);
              }}
            >
              Clear targets
            </button>
          </div>
          {badgeNote && (
            <p className="finder-badge-note" role="status">
              {badgeNote}
            </p>
          )}
          <div className="attribute-columns finder-attribute-columns">
            {editorColumns.map((column, index) => (
              <div key={index}>
                {column.map((group) => (
                  <section
                    className="attribute-group"
                    data-category={group.id}
                    key={group.id}
                    aria-label={group.name}
                  >
                    <h2>
                      <CategoryIcon groupId={group.id} />
                      {group.name}
                    </h2>
                    {group.attributes.map(([id, name]) => {
                      const value = targetRatings[id],
                        must = value > 25 && !bestEffort.has(id),
                        step = nextBadgeThreshold(id, value, { minHeight, maxHeight });
                      return (
                        <div
                          className={`attribute-row finder-attribute-row${value > 25 && !must ? " finder-best-effort" : ""}`}
                          key={id}
                        >
                          <div className="attribute-main">
                            <div className="attribute-label">
                              <label className="attribute-name" htmlFor={`target-${id}-value`}>
                                {name}
                              </label>
                              <button
                                type="button"
                                className="attribute-lock finder-must"
                                aria-label={`Must reach ${name}`}
                                aria-pressed={must}
                                disabled={value <= 25}
                                title={
                                  must
                                    ? "Must: every result reaches this target. Click for best effort."
                                    : "Best effort: results get as close as they can. Click to make it a Must."
                                }
                                onClick={() => toggleMust(id)}
                              >
                                {must ? (
                                  <LockKey size={16} weight="fill" />
                                ) : (
                                  <LockKeyOpen size={16} />
                                )}
                              </button>
                            </div>
                            <DesiredRating
                              id={id}
                              name={name}
                              value={value}
                              max={rangeMaximums[id]}
                              onChange={(next) => setDesiredRating(id, next)}
                            />
                            <button
                              type="button"
                              className="cap finder-max"
                              aria-label={`Set ${name} to max ${maximums[id]}`}
                              title={
                                maximums[id] < rangeMaximums[id]
                                  ? `Highest ${name} a body can reach alongside your other Musts (${rangeMaximums[id]} in this height range; going higher lowers Musts you set earlier). Click to target it.`
                                  : `Highest ${name} any body in this height range can reach. Click to target it.`
                              }
                              onClick={() => setDesiredRating(id, maximums[id])}
                            >
                              {maximums[id]}
                            </button>
                            <div
                              className="bar-cap-steps"
                              aria-label={`${name} cap breaker gains depend on the result body`}
                            >
                              {Array.from({ length: 5 }, (_, i) => (
                                <button
                                  type="button"
                                  key={i}
                                  disabled
                                  aria-label={`${name} cap breaker step ${i + 1} depends on the result body`}
                                >
                                  <span className="cap-step-value">—</span>
                                </button>
                              ))}
                              <span className="bar-cap-total" title="Calculated for each result">
                                <span className="cap-step-value">?</span>
                              </span>
                              <span className="reset-breakers-slot">
                                {value > 25 && (
                                  <button
                                    type="button"
                                    className="reset-attribute-breakers"
                                    aria-label={`Reset desired ${name}`}
                                    title={`Reset ${name} target (no minimum)`}
                                    onClick={() => setDesiredRating(id, 25)}
                                  >
                                    <ArrowCounterClockwise size={14} />
                                  </button>
                                )}
                              </span>
                            </div>
                            <div className="slider-wrap">
                              <div className="slider-track">
                                <span
                                  style={{
                                    width: `${rangeMaximums[id] > 25 ? ((value - 25) / (rangeMaximums[id] - 25)) * 100 : 0}%`,
                                  }}
                                />
                              </div>
                              <input
                                id={`target-${id}`}
                                type="range"
                                min="25"
                                max={rangeMaximums[id]}
                                step="1"
                                aria-label={`${name} slider`}
                                value={value}
                                onChange={(event) =>
                                  setDesiredRating(id, Number(event.target.value))
                                }
                              />
                            </div>
                            <div className="row-stepper">
                              <button
                                type="button"
                                aria-label={`Decrease desired ${name}`}
                                disabled={value <= 25}
                                onClick={() => setDesiredRating(id, value - 1)}
                              >
                                <Minus size={12} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Increase desired ${name}`}
                                disabled={value >= rangeMaximums[id]}
                                onClick={() => setDesiredRating(id, value + 1)}
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </div>
                          <div className="attribute-hint">
                            <span>
                              {value <= 25
                                ? "No target"
                                : must
                                  ? "Must reach after cap breakers"
                                  : "Best effort after cap breakers"}
                            </span>
                            {step && (
                              <button
                                type="button"
                                className="finder-next-step"
                                title={`Set ${name} to ${step.value}. Other requirements of these badges may also apply.`}
                                onClick={() => setDesiredRating(id, step.value)}
                              >
                                Next badge: {step.value} {step.items.slice(0, 2).join(", ")}
                                {step.items.length > 2 ? ` +${step.items.length - 2}` : ""}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            ))}
          </div>

          <div className="finder-submit">
            <p>
              Each result stays within 99 OVR. Cap ladders are checked against every proposed base
              spread; unsourced fallbacks are excluded.
            </p>
            {searching ? (
              <button type="button" className="secondary" onClick={stopSearch}>
                <Stop size={18} />
                Stop
              </button>
            ) : (
              <button type="button" className="primary" onClick={search}>
                <MagnifyingGlass size={18} />
                Find builds
              </button>
            )}
          </div>
          {errors.length > 0 && (
            <div className="finder-errors" role="alert">
              {errors.map((error, index) => (
                <p key={index}>{error}</p>
              ))}
            </div>
          )}
        </section>

        <section className="finder-results" aria-label="Build search results" aria-live="polite">
          <div className="finder-results-heading">
            <div>
              <span className="eyebrow">RANKED BUILDS</span>
              <h2>
                {searching
                  ? "Searching the cap tables"
                  : results?.closest && results.results.length
                    ? `No exact match · ${results.results.length} closest builds`
                    : results
                      ? `${results.results.length} builds found`
                      : "Ready when you are"}
              </h2>
            </div>
            {results && (
              <span className="finder-results-count">
                {results.scanned} / {results.totalBodies} bodies checked
              </span>
            )}
          </div>
          {searching ? (
            <div className="finder-empty-state">
              <span className="finder-loader" />
              <h3>Testing attribute spreads</h3>
              <p>
                Checking body ceilings, linked ratings, overall limits, and each cap-breaker step.
              </p>
            </div>
          ) : results?.results.length ? (
            <>
              {results.results.some((result) => result.totalCapsUsed > 0) && (
                <p className="finder-search-note finder-reshuffle-note">
                  Cap-breaker steps (+4 +3 +3) are worked out from each build&apos;s full spread.
                  Changing any other rating, even by one point, can change every step, so copy the
                  base ratings exactly before applying cap breakers.
                </p>
              )}
              {results.closest && (
                <p className="finder-search-note finder-closest-note">
                  No build reached every target. These come closest, ranked by total points short.
                  Short targets show final / target; red marks a missed Must.
                </p>
              )}
              {!results.completeSearch && (
                <p className="finder-search-note">
                  Showing the best candidates found in {results.scanned} matching exact body
                  profiles. This bounded search may miss other legal combinations.
                </p>
              )}
              <div className="finder-result-list">
                {results.results.map((result, index) => (
                  <article
                    className="finder-result-card"
                    key={`${result.body.position}-${result.body.height}-${result.body.weight}-${result.body.wingspan}-${index}`}
                  >
                    <header>
                      <span className="finder-rank">{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <h3>
                          {result.body.position} · {formatHeight(result.body.height)}
                        </h3>
                        <p>
                          {result.body.weight} lbs · {formatHeight(result.body.wingspan)} wingspan
                        </p>
                      </div>
                      <span
                        className={`finder-caps-pill ${result.totalCapsUsed > capBudgetTotal(request()) ? "negative" : "positive"}`}
                      >
                        {fewestCaps
                          ? `${result.totalCapsUsed} CB`
                          : `${result.totalCapsUsed} / ${capBudgetTotal(request()) || 0} CB`}
                      </span>
                      <strong className="finder-ovr">
                        {result.overall}
                        <small>OVR</small>
                      </strong>
                    </header>
                    <p className={`finder-result-status${result.misses?.length ? " short" : ""}`}>
                      {result.misses?.length
                        ? `${result.shortfall} ${result.shortfall === 1 ? "point" : "points"} short of your targets.`
                        : result.capTargets.length
                          ? "Every target hit."
                          : "No targets set."}
                    </p>
                    <div
                      className="finder-result-table"
                      role="table"
                      aria-label="Base attribute spread and cap breakers"
                    >
                      <div className="finder-table-head" role="row">
                        <span role="columnheader">Attribute</span>
                        <span role="columnheader">Set to</span>
                        <span role="columnheader">Cap breakers</span>
                        <span role="columnheader">Final</span>
                        <span role="columnheader">Target</span>
                      </div>
                      {groups.map((group) => (
                        <div
                          className="finder-table-group"
                          role="rowgroup"
                          data-category={group.id}
                          key={group.id}
                          aria-label={group.name}
                        >
                          <div className="finder-table-category" role="row">
                            <span role="rowheader">{group.name}</span>
                          </div>
                          {resultRowSets[index]
                            .filter((item) => item.group === group.id)
                            .map((item) => (
                              <div
                                className={`finder-table-row${item.focused ? " focused" : ""}`}
                                role="row"
                                key={item.id}
                              >
                                <span className="finder-table-name" role="cell">
                                  {item.name}
                                  {item.focused && item.must !== false && (
                                    <small className="finder-must-tag">MUST</small>
                                  )}
                                </span>
                                <span className="finder-table-base" role="cell">
                                  {item.base}
                                </span>
                                <span
                                  className="finder-cap-steps"
                                  role="cell"
                                  aria-label={
                                    item.steps.length
                                      ? `${item.name} cap breakers: ${item.steps.map((gain) => `+${gain}`).join(", ")}`
                                      : `${item.name}: no cap breakers`
                                  }
                                  title={
                                    item.steps.length
                                      ? `Each chip is one cap breaker and what it adds to ${item.name}`
                                      : undefined
                                  }
                                >
                                  {item.steps.length ? (
                                    item.steps.map((gain, step) => (
                                      <b key={step} data-step={step + 1}>
                                        +{gain}
                                      </b>
                                    ))
                                  ) : (
                                    <i aria-hidden="true">—</i>
                                  )}
                                </span>
                                <strong
                                  className={`finder-table-final${item.steps.length ? " boosted" : ""}${item.met === false ? (item.must === false ? " finder-short" : " negative") : ""}`}
                                  role="cell"
                                >
                                  {item.final}
                                </strong>
                                <span
                                  className={`finder-table-target${item.met === false ? (item.must === false ? " finder-short" : " negative") : ""}`}
                                  role="cell"
                                >
                                  {item.focused ? `${item.met ? "✓" : "✗"} ${item.target}` : ""}
                                </span>
                              </div>
                            ))}
                        </div>
                      ))}
                    </div>

                    <footer>
                      <span
                        className={
                          result.totalCapsUsed > capBudgetTotal(request()) ? "negative" : "positive"
                        }
                      >
                        {result.totalCapsUsed} cap breakers {fewestCaps ? "needed" : "used"}
                        {specialization && Number(specializationCount) > 0
                          ? ` · ${result.capTargets.filter((row) => byId[row.id].group === specialization).reduce((sum, row) => sum + row.caps, 0)} on ${groups.find((group) => group.id === specialization).name}`
                          : ""}
                      </span>
                      {result.misses?.length > 0 && (
                        <>
                          <span className="finder-short-summary">
                            {result.shortfall} {result.shortfall === 1 ? "point" : "points"} short:{" "}
                            {result.misses
                              .map((miss) => `${miss.name} ${miss.final}/${miss.target}`)
                              .join(", ")}
                          </span>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => applyReachedTargets(result)}
                          >
                            Use these targets
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => onOpenBuild(result.build)}
                      >
                        Open build <ArrowRight size={16} />
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            </>
          ) : results ? (
            <div className="finder-empty-state">
              <MagnifyingGlass size={34} />
              <h3>No build met those settings</h3>
              <p>
                Raise the cap budget, lower one of the final targets, or try a different height.
              </p>
            </div>
          ) : searchNote ? (
            <div className="finder-empty-state">
              <Stop size={34} />
              <h3>Search stopped</h3>
              <p>{searchNote}</p>
            </div>
          ) : (
            <div className="finder-empty-state finder-intro">
              <div className="finder-sample-route">
                <span>BASE SPREAD</span>
                <strong>65 Driving Dunk</strong>
                <i>+ five cap steps</i>
                <strong>89 final</strong>
                <span>points freed for your other priorities</span>
              </div>
              <h3>Put your points where they matter</h3>
              <p>Compare body options, after-cap ratings, and base attributes in one search.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
