/**
 * All money in the platform is stored and computed as INTEGER PAISE.
 * This is the admin panel's local copy so the project needs no external
 * shared package (kept identical to the api/web implementations).
 */

const PAISE_PER_RUPEE = 100;

/** exact decimal-string -> integer paise, round half up on the 3rd decimal */
const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d{1,3}))?$/;

function decimalStringToPaise(raw) {
  const m = DECIMAL_RE.exec(raw);
  if (!m) throw new TypeError(`bad rupee amount: ${raw}`);
  const [, neg, intPart, fracPart = ""] = m;
  const frac3 = (fracPart + "000").slice(0, 3); // pad to 3 digits
  let paise = Number(intPart) * 100 + Math.floor(Number(frac3) / 10);
  if (Number(frac3) % 10 >= 5) paise += 1; // e.g. 1.005 -> 100.5 -> 101
  if (!Number.isSafeInteger(paise)) throw new RangeError(`rupee amount out of range: ${raw}`);
  return neg ? -paise : paise;
}

/** Parse a rupee amount of any shape into integer paise. Throws on garbage. */
export function rupeesToPaise(rupees) {
  if (typeof rupees === "number") {
    if (!Number.isFinite(rupees)) throw new TypeError("non-finite rupee amount");
    return decimalStringToPaise(String(rupees));
  }
  if (typeof rupees === "string") {
    return decimalStringToPaise(rupees.trim());
  }
  throw new TypeError("rupee amount must be a number or a decimal string");
}

/** Display string: 5000 -> "₹50" ; 5050 -> "₹50.50" ; -5000 -> "-₹50" */
export function formatPaise(paise, { withSymbol = true } = {}) {
  if (!Number.isInteger(paise)) throw new TypeError(`not integer paise: ${paise}`);
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / PAISE_PER_RUPEE);
  const rest = abs % PAISE_PER_RUPEE;
  const frac = rest ? `.${String(rest).padStart(2, "0")}` : "";
  const symbol = withSymbol ? "₹" : "";
  return `${negative ? "-" : ""}${symbol}${rupees.toLocaleString("en-IN")}${frac}`;
}