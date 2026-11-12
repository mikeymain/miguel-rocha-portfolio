import ICAL from "ical.js";

export function parseBirthdays(text, source = {}) {
  try {
    const parsed = ICAL.parse(text);
    const cards = typeof parsed[0] === "string" ? [parsed] : parsed;
    if (!cards.length || cards.some((card) => card[0] !== "vcard"))
      throw new Error("Choose a vCard (.vcf) contact export.");
    const events = [];
    for (const raw of cards) {
      const card = new ICAL.Component(raw),
        birthday = card.getFirstProperty("bday");
      if (!birthday) continue;
      const value = String(birthday.getFirstValue()).split("T")[0].replaceAll("-", "");
      if (!/^(?:\d{8}|\d{4})$/.test(value)) continue;
      const year = value.length === 8 ? Number(value.slice(0, 4)) : null;
      const month = Number(value.slice(-4, -2)),
        day = Number(value.slice(-2));
      const start = new Date(2000, month - 1, day),
        end = new Date(2000, month - 1, day + 1);
      if (start.getMonth() !== month - 1 || start.getDate() !== day) continue;
      const structuredName = card.getFirstPropertyValue("n");
      const name = String(
        card.getFirstPropertyValue("fn") ||
          (Array.isArray(structuredName)
            ? [structuredName[1], structuredName[0]].filter(Boolean).join(" ")
            : "") ||
          "Unnamed contact",
      ).trim();
      const identity =
        card.getFirstPropertyValue("uid") ||
        card.getFirstPropertyValue("email") ||
        `${name.toLowerCase()}:${month}:${day}`;
      const id = `birthday:${encodeURIComponent(String(identity))}`;
      events.push({
        id,
        externalId: id,
        title: `${name}’s birthday`,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: true,
        repeat: "yearly",
        category: "birthdays",
        reminder: 0,
        location: "",
        notes: "",
        sequence: 0,
        cancelled: false,
        birthday: {
          month,
          day,
          year: year === 1604 || birthday.getParameter("x-apple-omit-year") ? null : year,
        },
        source: { type: "contacts", ...source },
      });
    }
    return events;
  } catch (error) {
    throw new Error(`Could not read this contact file. ${error.message}`);
  }
}
