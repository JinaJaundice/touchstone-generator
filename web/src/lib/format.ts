export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-GB");
export const fmtGbp = (n: number) => "GBP " + Math.round(n).toLocaleString("en-GB");
export const fmtGbpShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `GBP ${(n / 1e9).toFixed(1)}bn`;
  if (a >= 1e6) return `GBP ${(n / 1e6).toFixed(1)}m`;
  if (a >= 1e4) return `GBP ${Math.round(n / 1e3)}k`;
  return "GBP " + Math.round(n).toLocaleString("en-GB");
};
export const fmtPct = (x: number, d = 0) => `${(100 * x).toFixed(d)}%`;
export const fmtNum = (n: number, d = 1) => n.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmtShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}m`;
  if (a >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return fmtInt(n);
};
export const fmtHours = (h: number) => h >= 100 ? `${fmtInt(h)} h` : `${h.toFixed(1)} h`;
export const fmtDay = (d: number) => `day ${d + 1}`;
export const fmtMinute = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const fmtUnit = (unit: string, v: number) => {
  switch (unit) {
    case "gbp": return fmtGbp(v);
    case "count": return `${Math.round(v)}`;
    case "days": return `${Math.round(v)} days`;
    case "hours": return `${Math.round(v)} h`;
    case "ratio": return `${Math.round(v * 100)}%`;
    case "percent": return `${Math.round(v)}%`;
    case "sigma": return `${fmtNum(v, 1)}x`;
    case "score": return fmtNum(v, 2);
    default: return String(v);
  }
};
/** The name of each rail as the transaction log shows it. */
export const RAIL_LABEL: Record<string, string> = { FPS: "Faster Payments", BACS: "Bacs", CHAPS: "CHAPS", CARD: "Card", CASH: "Cash", INTL: "SWIFT", CRYPTO: "Bitcoin", INTERNAL: "Internal" };
/** The short words for a payment method that needs more than its rail. */
export const METHOD_SHORT: Record<string, string> = { "standing-order": "standing order", "forward-dated": "set for a date", "direct-debit": "Direct Debit", "bacs-credit": "Bacs credit", "card-chip": "chip and PIN", "card-contactless": "contactless", "card-online": "online", "card-magstripe": "magnetic stripe", atm: "cash machine", counter: "counter", "partner-counter": "Post Office" };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A day of the data set as its calendar date: "Mon 6 Jul". */
export const dayLabel = (date: string, weekday: number) => { const [, m, d] = date.split("-").map(Number); return `${DOW[weekday]} ${d} ${MON[m - 1]}`; };
export const plural = (n: number, one: string, many = one + "s") => `${fmtInt(n)} ${n === 1 ? one : many}`;
