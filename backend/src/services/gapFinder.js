function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

function diffDays(startYmd, endYmd) {
  const start = new Date(startYmd + "T00:00:00");
  const end = new Date(endYmd + "T00:00:00");

  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function getDayDate(day) {
  return (
    day.date ||
    day.dateLocalized ||
    day.day ||
    day.startDate ||
    day.checkInDate ||
    ""
  );
}

function isDayAvailable(day) {
  const status = String(day.status || "").toLowerCase();
  const availability = String(day.availability || "").toLowerCase();

  if (day.available === true) return true;
  if (day.isAvailable === true) return true;
  if (day.bookable === true) return true;
  if (day.isBookable === true) return true;

  if (status === "available") return true;
  if (status === "open") return true;
  if (status === "free") return true;

  if (availability === "available") return true;
  if (availability === "open") return true;

  if (day.available === false) return false;
  if (day.isAvailable === false) return false;
  if (day.bookable === false) return false;
  if (day.isBookable === false) return false;

  if (status === "reserved") return false;
  if (status === "booked") return false;
  if (status === "blocked") return false;
  if (status === "unavailable") return false;
  if (status === "not_available") return false;

  if (availability === "reserved") return false;
  if (availability === "booked") return false;
  if (availability === "blocked") return false;
  if (availability === "unavailable") return false;

  return false;
}

export function findAvailableGaps(calendarDays, minNights = 1, maxNights = 45) {
  const gaps = [];
  let gapStart = null;
  let lastAvailableDate = null;

  const days = Array.isArray(calendarDays) ? calendarDays : [];

  for (const day of days) {
    const date = getDayDate(day);

    if (!date) {
      continue;
    }

    const available = isDayAvailable(day);

    if (available) {
      if (!gapStart) {
        gapStart = date;
      }

      lastAvailableDate = date;
    }

    if (!available && gapStart) {
      const checkout = date;
      const nights = diffDays(gapStart, checkout);

      if (nights >= minNights && nights <= maxNights) {
        gaps.push({
          checkIn: gapStart,
          checkOut: checkout,
          nights
        });
      }

      gapStart = null;
      lastAvailableDate = null;
    }
  }

  if (gapStart && lastAvailableDate) {
    const checkout = toYmd(addDays(new Date(lastAvailableDate + "T00:00:00"), 1));
    const nights = diffDays(gapStart, checkout);

    if (nights >= minNights && nights <= maxNights) {
      gaps.push({
        checkIn: gapStart,
        checkOut: checkout,
        nights
      });
    }
  }

  return gaps;
}
