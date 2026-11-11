'use strict';
// Prayer time calculation from the sun's position (standard astronomical method).
// isha as a string like '90min' means a fixed interval after Maghrib.
const CALC_METHODS = {
  MWL: { name: 'Muslim World League', fajr: 18, isha: 17 },
  Egypt: { name: 'Egyptian General Authority', fajr: 19.5, isha: 17.5 },
  Makkah: { name: 'Umm al-Qura, Makkah', fajr: 18.5, isha: '90min' },
  Karachi: { name: 'Univ. of Islamic Sciences, Karachi', fajr: 18, isha: 18 },
  ISNA: { name: 'ISNA (North America)', fajr: 15, isha: 15 },
  France: { name: 'France (12°)', fajr: 12, isha: 12 }
};

// Returns { fajr, sunrise, dhuhr, asr, maghrib, isha } as Date objects in the
// device's time zone, or null where the sun does not rise or set that day.
function prayerTimes(key, lat, lng, methodId, asrFactor) {
  const method = CALC_METHODS[methodId] || CALC_METHODS.MWL;
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const fix = (a, n) => a - n * Math.floor(a / n);
  let [y, m, d] = key.split('-').map(Number);
  const tz = -new Date(y, m - 1, d, 12).getTimezoneOffset() / 60;
  const base = new Date(y, m - 1, d);

  let jy = y, jm = m;
  if (jm <= 2) { jy -= 1; jm += 12; }
  const A = Math.floor(jy / 100);
  const jd = Math.floor(365.25 * (jy + 4716)) + Math.floor(30.6001 * (jm + 1)) + d + 2 - A + Math.floor(A / 4) - 1524.5 - lng / 360;

  const sun = t => {
    const D = jd + t - 2451545;
    const g = fix(357.529 + 0.98560028 * D, 360);
    const q = fix(280.459 + 0.98564736 * D, 360);
    const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)), 360);
    const e = 23.439 - 0.00000036 * D;
    const ra = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15;
    return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt: q / 15 - fix(ra, 24) };
  };
  const noon = t => fix(12 - sun(t).eqt, 24);
  // Time at which the sun is `angle` degrees below the horizon, before (ccw) or after noon.
  const angleTime = (angle, t, ccw) => {
    const decl = sun(t).decl;
    const x = (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) / (Math.cos(rad(decl)) * Math.cos(rad(lat)));
    const diff = deg(Math.acos(x)) / 15;
    return noon(t) + (ccw ? -diff : diff);
  };
  const asrTime = t => {
    const decl = sun(t).decl;
    return angleTime(-deg(Math.atan(1 / (asrFactor + Math.tan(rad(Math.abs(lat - decl)))))), t);
  };

  const h = {
    fajr: angleTime(method.fajr, 5 / 24, true),
    sunrise: angleTime(0.833, 6 / 24, true),
    dhuhr: noon(12 / 24),
    asr: asrTime(13 / 24),
    maghrib: angleTime(0.833, 18 / 24),
    isha: typeof method.isha === 'number' ? angleTime(method.isha, 18 / 24) : NaN
  };
  if (isNaN(h.sunrise) || isNaN(h.maghrib)) return null;

  // High latitudes: twilight may never end, so cap Fajr/Isha to a share of the night.
  const night = 24 - (h.maghrib - h.sunrise);
  const fajrCap = method.fajr / 60 * night;
  if (isNaN(h.fajr) || h.sunrise - h.fajr > fajrCap) h.fajr = h.sunrise - fajrCap;
  if (typeof method.isha === 'number') {
    const ishaCap = method.isha / 60 * night;
    if (isNaN(h.isha) || h.isha - h.maghrib > ishaCap) h.isha = h.maghrib + ishaCap;
  } else {
    h.isha = h.maghrib + parseInt(method.isha, 10) / 60;
  }

  const out = {};
  for (const k in h) out[k] = new Date(base.getTime() + Math.round((h[k] + tz - lng / 15) * 60) * 60000);
  return out;
}

if (typeof module !== 'undefined') module.exports = { prayerTimes, CALC_METHODS };
