const PAISE_PER_RUPEE = 100;

function decimalStringToPaise(value) {
  const match = /^(-)?(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw new TypeError(`Invalid rupee amount: ${value}`);

  const [, negative, whole, fraction = ""] = match;
  const fractionInMilliPaise = Number((fraction + "000").slice(0, 3));
  let paise = Number(whole) * PAISE_PER_RUPEE + Math.floor(fractionInMilliPaise / 10);
  if (fractionInMilliPaise % 10 >= 5) paise += 1;
  if (!Number.isSafeInteger(paise)) throw new RangeError("Rupee amount is out of range");

  return negative ? -paise : paise;
}

export function rupeesToPaise(rupees) {
  if (typeof rupees === "number") {
    if (!Number.isFinite(rupees)) throw new TypeError("Rupee amount must be finite");
    return decimalStringToPaise(String(rupees));
  }
  if (typeof rupees === "string") return decimalStringToPaise(rupees.trim());
  throw new TypeError("Rupee amount must be a number or decimal string");
}

export function formatPaise(paise, { withSymbol = true } = {}) {
  if (!Number.isInteger(paise)) throw new TypeError(`Paise must be an integer: ${paise}`);

  const negative = paise < 0;
  const absolute = Math.abs(paise);
  const roundedRupees = Math.trunc(absolute / PAISE_PER_RUPEE) +
    (absolute % PAISE_PER_RUPEE >= 50 ? 1 : 0);
  const symbol = withSymbol ? "₹" : "";

  return `${negative ? "-" : ""}${symbol}${roundedRupees.toLocaleString("en-IN")}`;
}

export function computePrize(entryFeePaise) {
  if (!Number.isInteger(entryFeePaise) || entryFeePaise < 0) {
    throw new TypeError("Entry fee must be a non-negative integer number of paise");
  }

  const totalPoolPaise = entryFeePaise * 2;
  const commissionBps = entryFeePaise <= 50000 ? 1000 : 500;
  const commissionPaise = Math.floor((entryFeePaise * commissionBps) / 10000);
  const prizePaise = totalPoolPaise - commissionPaise;

  return {
    entryFeePaise,
    totalPoolPaise,
    commissionPaise,
    commissionBps,
    prizePaise,
    winAmountPaise: prizePaise,
  };
}
