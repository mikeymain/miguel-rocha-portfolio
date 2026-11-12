import test from "node:test";
import assert from "node:assert/strict";
import { parseBirthdays } from "../src/core/birthdays.js";
import { applyAction } from "../src/core/actions.js";
import { emptyState, occurrences } from "../src/core/calendar.js";
process.env.TZ = "Europe/Lisbon";
const card = (name, bday, uid = "contact-1") =>
  `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${uid}\r\nFN:${name}\r\nBDAY:${bday}\r\nEND:VCARD`;
test("iPhone vCard birthdays become yearly all-day events with the original birth year", () => {
  const [event] = parseBirthdays(card("Alice Smith", "1992-07-09"));
  assert.equal(event.title, "Alice Smith’s birthday");
  assert.equal(event.repeat, "yearly");
  assert.equal(event.allDay, true);
  assert.equal(event.birthday.year, 1992);
  const future = occurrences(event, new Date("2027-01-01"), new Date("2028-01-01"));
  assert.equal(future.length, 1);
  assert.equal(new Date(future[0].start).getMonth(), 6);
  assert.equal(new Date(future[0].start).getDate(), 9);
});
test("multiple vCards and omitted birth years are supported", () => {
  const v4 = "BEGIN:VCARD\r\nVERSION:4.0\r\nUID:contact-2\r\nFN:Ben\r\nBDAY:--0229\r\nEND:VCARD";
  const result = parseBirthdays(
    `${card("Alice", "1604-07-09").replace("BDAY:", "BDAY;X-APPLE-OMIT-YEAR=1604:")}\r\n${v4}`,
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].birthday.year, null);
  assert.equal(result[1].birthday.day, 29);
  assert.equal(occurrences(result[1], new Date("2027-01-01"), new Date("2028-01-01")).length, 0);
  assert.equal(occurrences(result[1], new Date("2028-01-01"), new Date("2029-01-01")).length, 1);
});
test("reimporting contacts updates a birthday instead of creating duplicates", () => {
  let state = applyAction(emptyState(), {
    type: "importBirthdays",
    text: card("Alice", "1992-07-09"),
  });
  state = applyAction(state, { type: "importBirthdays", text: card("Alice Smith", "1992-07-10") });
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].birthday.day, 10);
  assert.equal(state.events[0].title, "Alice Smith’s birthday");
});
test("yearly all-day birthdays always end at local midnight across DST", () => {
  const [event] = parseBirthdays(card("Alice", "1992-03-29"));
  for (const year of [2026, 2027, 2028]) {
    const [instance] = occurrences(event, new Date(year, 0, 1), new Date(year + 1, 0, 1));
    assert.equal(new Date(instance.start).getHours(), 0);
    assert.equal(new Date(instance.end).getHours(), 0);
    assert.equal(new Date(instance.end).getDate(), 30);
  }
});
test("calendar text is not accepted as a contact export", () => {
  assert.throws(() => parseBirthdays("not a vCard"), /contact|vcard/i);
});

test("contact birthdays ring at midnight on the day", () => {
  const [birthday] = parseBirthdays(
    "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Rita\r\nUID:r1\r\nBDAY:1990-05-12\r\nEND:VCARD\r\n",
  );
  assert.equal(birthday.reminder, 0);
  assert.equal(new Date(birthday.start).getHours(), 0);
});
