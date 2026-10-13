const crypto = require('crypto');
let tok, exp = 0;

async function token() {
  if (tok && Date.now() < exp) return tok;
  const sa = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString());
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b({ alg: 'RS256', typ: 'JWT' }) + '.' + b({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head), sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + sig }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google auth failed');
  tok = j.access_token; exp = Date.now() + 3300e3;
  return tok;
}

// Google Calendar API sur l'agenda configuré
async function cal(method, path, body) {
  const id = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID);
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${id}${path}`, {
    method, headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error('Calendar ' + r.status + ' ' + await r.text());
  return r.status === 204 ? null : r.json();
}

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));

module.exports = { cal, safeEq };
