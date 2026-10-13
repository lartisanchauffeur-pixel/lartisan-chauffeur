const { cal, safeEq } = require('./_lib');
const json = (code, o) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
const PREFIX = { upcoming: '🚘 ', done: '✅ TERMINÉ — ', cancelled: '❌ ANNULÉ — ' };
const COLOR = { upcoming: '5', done: '10', cancelled: '8' };

exports.handler = async (e) => {
  const pw = (e.headers.authorization || '').replace('Bearer ', '');
  if (!process.env.ADMIN_PASSWORD || !safeEq(pw, process.env.ADMIN_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 600));
    return json(401, { error: 'auth' });
  }
  try {
    if (e.httpMethod === 'GET') {
      const timeMin = new Date(Date.now() - 365 * 864e5).toISOString();
      const r = await cal('GET', `/events?privateExtendedProperty=app%3Dlartisan&singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(timeMin)}`);
      return json(200, { bookings: (r.items || []).filter((x) => x.status !== 'cancelled').map((x) => ({ id: x.id, start: x.start.dateTime, ...(x.extendedProperties?.private || {}) })) });
    }
    if (e.httpMethod === 'POST') {
      const { id, status } = JSON.parse(e.body || '{}');
      if (!id || !PREFIX[status]) return json(400, { error: 'invalid' });
      const ev = await cal('GET', '/events/' + encodeURIComponent(id));
      const p = { ...(ev.extendedProperties?.private || {}), status };
      await cal('PATCH', '/events/' + encodeURIComponent(id), {
        summary: `${PREFIX[status]}${p.service} — ${p.name}`, colorId: COLOR[status],
        transparency: status === 'cancelled' ? 'transparent' : 'opaque', extendedProperties: { private: p } });
      return json(200, { ok: true });
    }
    return json(405, { error: 'method' });
  } catch (err) { console.error(err); return json(500, { error: 'server' }); }
};
