// Parser for a Travian world's public map.sql dump.
// Row layout: (fieldId,x,y,tribe,vid,'village',uid,'player',aid,'alliance',pop,region,capital,city,harbor,vp)
(function (root) {
	"use strict";

	const ROW_PREFIX = /^INSERT INTO `x_world` VALUES\s*\(/;
	const NATURE_TRIBE = 4;
	const NATAR_TRIBE = 5;

	function unescapeSql(raw) {
		return raw.replace(/\\(.)|''/g, (match, ch) => {
			if (match === "''") return "'";
			if (ch === "n") return "\n";
			if (ch === "r") return "\r";
			if (ch === "t") return "\t";
			if (ch === "0") return "";
			return ch;
		});
	}

	// Reads one quoted string starting at body[start] === "'".
	// Returns { value, end } or null when the quote is not closed.
	function readQuoted(body, start) {
		let j = start + 1;
		let out = "";
		while (j < body.length) {
			const ch = body[j];
			if (ch === "\\" && j + 1 < body.length) {
				out += body.slice(j, j + 2);
				j += 2;
			} else if (ch === "'" && body[j + 1] === "'") {
				out += "''";
				j += 2;
			} else if (ch === "'") {
				return { value: unescapeSql(out), end: j + 1 };
			} else {
				out += ch;
				j++;
			}
		}
		return null;
	}

	// Splits the inside of one VALUES (...) tuple into fields.
	// Quoted strings may contain commas, parentheses, \' and ''.
	function splitTuple(body) {
		const fields = [];
		let i = 0;
		const n = body.length;
		while (i < n) {
			while (i < n && body[i] === " ") i++;
			if (body[i] === "'") {
				const quoted = readQuoted(body, i);
				if (!quoted) return null;
				fields.push({ str: quoted.value });
				i = quoted.end;
			} else {
				let j = i;
				while (j < n && body[j] !== ",") j++;
				fields.push({ raw: body.slice(i, j).trim() });
				i = j;
			}
			while (i < n && body[i] === " ") i++;
			if (i < n) {
				if (body[i] !== ",") return null;
				i++;
			}
		}
		return fields;
	}

	function intField(field) {
		if (!field || field.raw == null) return NaN;
		return /^-?\d+$/.test(field.raw) ? Number(field.raw) : NaN;
	}

	function strField(field) {
		return field && field.str != null ? field.str : "";
	}

	// Parses one INSERT line. Returns a row object or null.
	function parseLine(line) {
		const trimmed = String(line).trim();
		if (!ROW_PREFIX.test(trimmed)) return null;
		let body = trimmed.replace(ROW_PREFIX, "").replace(/;\s*$/, "");
		if (!body.endsWith(")")) return null;
		body = body.slice(0, -1);
		const f = splitTuple(body);
		if (!f || f.length < 11) return null;
		const row = {
			x: intField(f[1]),
			y: intField(f[2]),
			tribe: intField(f[3]),
			vid: intField(f[4]),
			village: strField(f[5]),
			uid: intField(f[6]),
			player: strField(f[7]),
			aid: intField(f[8]),
			alliance: strField(f[9]),
			pop: intField(f[10]),
		};
		for (const key of ["x", "y", "tribe", "vid", "uid", "aid", "pop"]) {
			if (!Number.isFinite(row[key])) return null;
		}
		return row;
	}

	// Parses the whole dump into a compact columnar snapshot.
	// Nature (4) and Natar (5) rows are dropped.
	function parseMapSql(text) {
		const rows = [];
		let skipped = 0;
		for (const line of String(text || "").split(/\r?\n/)) {
			if (!line.trim()) continue;
			const row = parseLine(line);
			if (!row) {
				skipped++;
				continue;
			}
			if (row.tribe === NATURE_TRIBE || row.tribe === NATAR_TRIBE) continue;
			rows.push(row);
		}
		const n = rows.length;
		const snap = {
			x: new Int32Array(n),
			y: new Int32Array(n),
			tribe: new Uint8Array(n),
			vid: new Int32Array(n),
			uid: new Int32Array(n),
			aid: new Int32Array(n),
			pop: new Int32Array(n),
			alliances: {},
			players: {},
			skipped,
		};
		rows.forEach((r, i) => {
			snap.x[i] = r.x;
			snap.y[i] = r.y;
			snap.tribe[i] = r.tribe;
			snap.vid[i] = r.vid;
			snap.uid[i] = r.uid;
			snap.aid[i] = r.aid;
			snap.pop[i] = r.pop;
			if (r.aid) snap.alliances[r.aid] = r.alliance;
			snap.players[r.uid] = r.player;
		});
		return snap;
	}

	function summarize(snap) {
		const uids = new Set();
		let maxUid = 0;
		let pop = 0;
		for (let i = 0; i < snap.uid.length; i++) {
			uids.add(snap.uid[i]);
			if (snap.uid[i] > maxUid) maxUid = snap.uid[i];
			pop += snap.pop[i];
		}
		return { maxUid, accounts: uids.size, villages: snap.uid.length, pop };
	}

	const api = { parseMapSql, parseLine, splitTuple, unescapeSql, summarize };
	root.WWMapSql = api;
})(globalThis);
