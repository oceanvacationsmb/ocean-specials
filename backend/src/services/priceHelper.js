export function getTotalFromQuote(quote) {
  const ratePlan = quote?.rates?.ratePlans?.[0];
  const money = ratePlan?.ratePlan?.money;

  if (!money) {
    return null;
  }

  return {
    currency: money.currency || "USD",
    accommodation: money.fareAccommodation || 0,
    cleaning: money.fareCleaning || 0,
    taxes: money.totalTaxes || 0,
    regularTotal: money.hostPayout || money.totalPrice || money.subTotalPrice || 0
  };
}

export function applyDiscount(regularTotal, discountPercent) {
  const discountAmount = regularTotal * (discountPercent / 100);
  const specialTotal = regularTotal - discountAmount;

  return {
    discountAmount: roundMoney(discountAmount),
    specialTotal: roundMoney(specialTotal)
  };
}

export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
}
