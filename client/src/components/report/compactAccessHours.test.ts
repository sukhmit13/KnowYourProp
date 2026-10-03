import assert from "node:assert/strict";
import test from "node:test";
import { compactAccessHours } from "./compactAccessHours";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const week = (hours: string) => days.map(day => `${day}: ${hours}`).join("; ");

test("the screenshot's repeated Whole Foods hours become one accurate weekly range", () => {
  assert.equal(compactAccessHours(week("8:00am-10:00pm")), "Mon–Sun 8am–10pm");
  assert.equal(compactAccessHours(week("10:00am–8:00pm")), "Mon–Sun 10am–8pm");
});

test("weekday and weekend differences, closed days and half hours stay distinct", () => {
  assert.equal(compactAccessHours(
    days.map((day, i) => `${day}: ${i < 5 ? "10:00 AM to 8:00 PM" : "9:30am-6:15pm"}`).join("; "),
  ), "Mon–Fri 10am–8pm; Sat–Sun 9:30am–6:15pm");
  assert.equal(compactAccessHours("Monday: 8am-5pm; Tuesday: 8am-5pm; Saturday: Closed; Sunday: closed"),
    "Mon–Tue 8am–5pm; Sat–Sun Closed");
});

test("missing days are not filled and midnight/overnight access remains accurate", () => {
  assert.equal(compactAccessHours("Mon: 8am-10pm; Wed: 8am-10pm"), "Mon 8am–10pm; Wed 8am–10pm");
  assert.equal(compactAccessHours("Fri: 10pm-2am; Sat: 10pm-2am"), "Fri–Sat 10pm–2am");
  assert.equal(compactAccessHours("Mon: 12:00am-12:00pm"), "Mon 12am–12pm");
  assert.equal(compactAccessHours("Sun: 8am-10pm; Mon: 8am-10pm"), "Mon 8am–10pm; Sun 8am–10pm");
});

test("free text, malformed or ambiguous schedules, and merged access records are retained", () => {
  for (const value of [
    "24 hours daily", "Contact station for hours of availability.",
    "Mon: 8am-5pm; Mon: 10am-8pm", "Holiday: 8am-5pm",
    "Mon: 8am-5pm; Public access only", "Mon: ",
  ]) assert.equal(compactAccessHours(value), value);
  assert.equal(compactAccessHours(`${week("8:00am-10:00pm")} · Public`), "Mon–Sun 8am–10pm · Public");
  assert.equal(compactAccessHours("Mon: 08:00-22:00; Tue: 08:00-22:00"), "Mon–Tue 08:00-22:00");
  assert.equal(compactAccessHours(undefined), "Unknown");
  assert.equal(compactAccessHours(null), "Unknown");
  assert.equal(compactAccessHours("   "), "Unknown");
});