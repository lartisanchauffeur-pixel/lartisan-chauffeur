const { cal } = require('./_lib');
const HOURLY = ['Mise à disposition', 'City Tour Marseille & PACA'];
const json = (code, o) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });

exports.handler = async (e) => {
  if (e.httpMethod !== 'POST') return json(405, { error: 'method' });
  let d; try { d = JSON.parse(e.body); } catch { return json(400, { error: 'json' }); }
  if (d.website) return json(200, { ok: true }); // anti-spam (champ piège)
  const need = ['name', 'phone', 'email', 'service', 'date', 'time', 'from', 'to', 'pax'];
  if (need.some((k) => !String(d[k] || '').trim()) || !/^\d{4}-\d\d-\d\d$/.test(d.date) || !/^\d\d:\d\d$/.test(d.time))
    return json(400, { error: 'invalid' });

  const keys = ['name', 'phone', 'email', 'service', 'from', 'to', 'pax', 'bags', 'trip', 'hours', 'price', 'comments'];
  const p = { app: 'lartisan', status: 'upcoming' };
  keys.forEach((k) => { p[k] = String(d[k] ?? '').slice(0, 400); });

  const hrs = HOURLY.includes(p.service) && Number(p.hours) > 0 ? Math.min(Number(p.hours), 24) : 1;
  const start = `${d.date}T${d.time}:00`;
  const end = new Date(new Date(start + 'Z').getTime() + hrs * 3600e3).toISOString().slice(0, 19);
  const text = [
    `Client : ${p.name}`, `Tél : ${p.phone}`, `Email : ${p.email}`, `Service : ${p.service}`,
    `Départ : ${p.from}`, `Arrivée : ${p.to}`, p.trip && `Vol/Train : ${p.trip}`,
    `Passagers : ${p.pax} · Bagages : ${p.bags || 0}`, p.hours && `Durée : ${p.hours} h`,
    p.price && `Estimation : ${p.price}`, p.comments && `Commentaires : ${p.comments}`,
  ].filter(Boolean).join('\n');

  try {
    await cal('POST', '/events', {
      summary: `🚘 ${p.service} — ${p.name}`, location: p.from, description: text,
      start: { dateTime: start, timeZone: 'Europe/Paris' }, end: { dateTime: end, timeZone: 'Europe/Paris' },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 1440 }] },
      extendedProperties: { private: p },
    });
  } catch (err) { console.error(err); return json(500, { error: 'calendar' }); }

  // Notifications (facultatives, n'empêchent jamais la réservation)
  const when = `${d.date.split('-').reverse().join('/')} à ${d.time}`;
  try {
    if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL)
      await fetch('https://api.resend.com/emails', { method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'L’Artisan Chauffeur <onboarding@resend.dev>', to: [process.env.NOTIFY_EMAIL],
          subject: `Nouvelle réservation : ${p.name}, ${when}`, text }) });
    if (process.env.NTFY_TOPIC)
      await fetch('https://ntfy.sh/' + process.env.NTFY_TOPIC, { method: 'POST',
        headers: { Title: 'Nouvelle reservation', Priority: 'high' }, body: `${p.name} - ${p.service}\n${when}\n${p.from} -> ${p.to}` });
  } catch (err) { console.error('notif', err); }

  return json(200, { ok: true });
};
