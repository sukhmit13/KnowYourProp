const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_INDEX: Record<string, number> = {
  mon: 0, monday: 0,
  tue: 1, tues: 1, tuesday: 1,
  wed: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4,
  sat: 5, saturday: 5,
  sun: 6, sunday: 6,
};

function compactTime(hour: string, minute: string | undefined, meridiem: string): string | null {
  const h = Number(hour);
  const m = Number(minute ?? 0);
  if (h < 1 || h > 12 || m > 59) return null;
  return `${h}${m ? `:${String(m).padStart(2, "0")}` : ""}${meridiem[0].toLowerCase()}m`;
}

function compactHours(hours: string): string {
  const normalized = hours.trim().replace(/\s+/g, " ");
  const range = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)\s*(?:[-–—]|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)$/i);
  if (!range) return /^closed$/i.test(normalized) ? "Closed" : normalized;
  const start = compactTime(range[1], range[2], range[3]);
  const end = compactTime(range[4], range[5], range[6]);
  return start && end ? `${start}–${end}` : normalized;
}

function compactSchedule(schedule: string): string {
  const parts = schedule.split(";").map(part => part.trim()).filter(Boolean);
  const byDay = new Map<number, string>();
  for (const part of parts) {
    const match = part.match(/^([a-z]+)\s*:\s*(.+)$/i);
    if (!match) return schedule;
    const day = DAY_INDEX[match[1].toLowerCase()];
    // Ambiguous, duplicate or unrecognized days retain the supplied text.
    if (day == null || byDay.has(day)) return schedule;
    byDay.set(day, compactHours(match[2]));
  }
  if (!byDay.size) return schedule;

  const ordered = [...byDay.entries()].sort(([a], [b]) => a - b);
  const groups: string[] = [];
  let firstDay = ordered[0][0];
  let lastDay = firstDay;
  let hours = ordered[0][1];
  const emit = () => groups.push(`${DAYS[firstDay]}${lastDay === firstDay ? "" : `–${DAYS[lastDay]}`} ${hours}`);
  for (const [day, nextHours] of ordered.slice(1)) {
    if (day === lastDay + 1 && nextHours === hours) {
      lastDay = day;
    } else {
      emit();
      firstDay = lastDay = day;
      hours = nextHours;
    }
  }
  emit();
  return groups.join("; ");
}

/** Presentation-only: compact matching consecutive days, never infer a schedule. */
export function compactAccessHours(value: string | null | undefined): string {
  if (!value?.trim()) return "Unknown";
  // Address deduplication can retain multiple distinct access descriptions.
  return value.split(" · ").map(compactSchedule).join(" · ");
}