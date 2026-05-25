export function getTotalFromQuote(quote) {
  const ratePlan = quote?.rates?.ratePlans?.[0];
  const money = ratePlan?.ratePlan?.money;

  if (!money) {
    return null;
  }

  const accommodation = roundMoney(money.fareAccommodation || 0);
  const cleaning = roundMoney(money.fareCleaning || 0);
  const apiTaxes = roundMoney(money.totalTaxes || 0);

  const subtotalBeforeBookingFee = roundMoney(accommodation + cleaning);

  const bookingEngineFeePercent = Number(
    process.env.BOOKING_ENGINE_FEE_PERCENT || 6
  );

  const bookingEngineFeeTaxPercent = Number(
    process.env.BOOKING_ENGINE_FEE_TAX_PERCENT || 7
  );

  const bookingEngineFee = roundMoney(
    subtotalBeforeBookingFee * (bookingEngineFeePercent / 100)
  );

  const bookingEngineFeeTax = roundMoney(
    bookingEngineFee * (bookingEngineFeeTaxPercent / 100)
  );

  const fees = roundMoney(cleaning + bookingEngineFee);

  const taxes = roundMoney(apiTaxes + bookingEngineFeeTax);

  const subtotalBeforeTaxes = roundMoney(accommodation + fees);

  const guestTotal = roundMoney(subtotalBeforeTaxes + taxes);

  return {
    currency: money.currency || "USD",

    accommodation,
    cleaning,

    bookingEngineFeePercent,
    bookingEngineFee,
    bookingEngineFeeTaxPercent,
    bookingEngineFeeTax,

    fees,
    apiTaxes,
    taxes,

    subtotalBeforeTaxes,
    regularTotal: guestTotal
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
