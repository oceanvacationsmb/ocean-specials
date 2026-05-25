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

export function findAvailableGaps(calendarDays, minNights = 2, maxNights = 7) {
  const gaps = [];
  let gapStart = null;

  for (const day of calendarDays) {
    const date = day.date;
    const isAvailable = day.status === "available";

    if (isAvailable && !gapStart) {
      gapStart = date;
    }

    if (!isAvailable && gapStart) {
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
    }
  }

  if (gapStart) {
    const lastDay = calendarDays[calendarDays.length - 1];
    const checkout = toYmd(addDays(new Date(lastDay.date + "T00:00:00"), 1));
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
