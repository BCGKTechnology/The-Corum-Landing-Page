// Vercel serverless function: POST /api/register
// Saves a "Register My Interest" submission to Supabase.
// Then emails the lead to the BCGK team through Resend.
// Vercel environment variables:
//   SUPABASE_URL, SUPABASE_ANON_KEY   (required, saves the lead)
//   RESEND_API_KEY, LEAD_EMAIL_FROM   (required for the email alert)
//   LEAD_EMAIL_TO                     (optional, comma-separated; overrides the list below)

const CONTACT = ['call_text', 'email'];
const AMOUNTS = ['100k', '200k', '300k', '400k', '500k_plus'];
const ACCREDITED = ['yes', 'no', 'unsure'];

const DEFAULT_RECIPIENTS = [
  'Chuck@BCGK.com',
  'Alex@BCGK.com',
  'Brandon@BCGK.com',
  'Kevin@BCGK.com',
  'Greg@BCGK.com',
  'juwon.arag@gmail.com'
];
const SUBJECT = 'The Corum - Investor Registering Interest';

const LABELS = {
  contact_method: { call_text: 'Call/Text', email: 'Email' },
  investment_amount: { '100k': '$100k', '200k': '$200k', '300k': '$300k', '400k': '$400k', '500k_plus': '$500k+' },
  accredited: { yes: 'Yes', no: 'No', unsure: 'Unsure' }
};

function esc(v) {
  return String(v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function sendLeadEmail(lead) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_EMAIL_FROM;
  if (!apiKey || !from) {
    console.error('Lead email skipped: missing RESEND_API_KEY or LEAD_EMAIL_FROM');
    return;
  }
  const to = (process.env.LEAD_EMAIL_TO || DEFAULT_RECIPIENTS.join(','))
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

  const when = new Date(lead.submitted_at).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short'
  }) + ' PT';
  const rows = [
    ['Full Name', esc(lead.full_name)],
    ['Email', '<a href="mailto:' + esc(lead.email) + '">' + esc(lead.email) + '</a>'],
    ['Phone', '<a href="tel:' + esc(lead.phone.replace(/[^\d+]/g, '')) + '">' + esc(lead.phone) + '</a>'],
    ['Preferred Contact', esc(LABELS.contact_method[lead.contact_method])],
    ['Able to Invest', esc(LABELS.investment_amount[lead.investment_amount])],
    ['Accredited Investor', esc(LABELS.accredited[lead.accredited])],
    ['Submitted', esc(when)]
  ];
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px">' +
    '<h2 style="margin:0 0 6px;font-size:20px">New investor registration: The Corum</h2>' +
    '<p style="margin:0 0 16px;color:#4a5462;font-size:14px">Submitted through the Corum landing page.</p>' +
    '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:15px">' +
    rows.map(function (r, i) {
      return '<tr style="background:' + (i % 2 ? '#ffffff' : '#ebeff4') + '">' +
        '<td style="padding:10px 12px;font-weight:bold;width:40%">' + r[0] + '</td>' +
        '<td style="padding:10px 12px">' + r[1] + '</td></tr>';
    }).join('') +
    '</table>' +
    '<p style="margin:16px 0 0;color:#4a5462;font-size:13px">Reply to this email to respond to the investor directly.</p>' +
    '</div>';
  const text = [
    'New investor registration: The Corum', '',
    'Full Name: ' + lead.full_name,
    'Email: ' + lead.email,
    'Phone: ' + lead.phone,
    'Preferred Contact: ' + LABELS.contact_method[lead.contact_method],
    'Able to Invest: ' + LABELS.investment_amount[lead.investment_amount],
    'Accredited Investor: ' + LABELS.accredited[lead.accredited],
    'Submitted: ' + when
  ].join('\n');

  try {
    const r = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ from: from, to: to, reply_to: lead.email, subject: SUBJECT, html: html, text: text })
    });
    if (!r.ok) console.error('Lead email failed', r.status, await r.text());
  } catch (err) {
    console.error('Lead email error', err);
  }
}

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return res.status(500).json({ error: 'Server not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Honeypot: real visitors never fill this hidden field. Pretend success for bots.
  if (clean(body.company, 200)) return res.status(200).json({ ok: true });

  const lead = {
    full_name: clean(body.full_name, 120),
    email: clean(body.email, 254).toLowerCase(),
    phone: clean(body.phone, 40),
    contact_method: clean(body.contact_method, 20),
    investment_amount: clean(body.investment_amount, 20),
    accredited: clean(body.accredited, 10),
    source: 'corum-landing-page',
    submitted_at: new Date().toISOString(),
    user_agent: clean(req.headers['user-agent'] || '', 300)
  };

  const valid =
    lead.full_name.length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email) &&
    lead.phone.replace(/\D/g, '').length >= 10 &&
    CONTACT.includes(lead.contact_method) &&
    AMOUNTS.includes(lead.investment_amount) &&
    ACCREDITED.includes(lead.accredited);
  if (!valid) return res.status(400).json({ error: 'Please check the form and try again.' });

  const headers = {
    'Content-Type': 'application/json',
    apikey: key,
    Prefer: 'return=minimal'
  };
  // Legacy anon keys are JWTs (start with "eyJ") and also go in the Authorization header.
  // Newer "sb_publishable_..." keys only use the apikey header.
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;

  try {
    const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/corum_leads', {
      method: 'POST',
      headers,
      body: JSON.stringify(lead)
    });
    if (!r.ok) {
      console.error('Supabase insert failed', r.status, await r.text());
      return res.status(502).json({ error: 'Could not save your registration.' });
    }
    // The lead is saved. Send the team alert; an email problem never blocks the investor.
    await sendLeadEmail(lead);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Supabase request error', err);
    return res.status(502).json({ error: 'Could not save your registration.' });
  }
};
