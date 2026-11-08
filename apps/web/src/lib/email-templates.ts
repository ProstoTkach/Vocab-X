// The letters. Email clients support little: tables, inline styles and no theme variables, so the
// app's colours are written out here (the light theme's accent, surface and background).
import en from '../../messages/en/email.json';
import uk from '../../messages/uk/email.json';

const TEXTS = { uk, en };
export type EmailLocale = keyof typeof TEXTS;

export const emailLocale = (locale: string | null | undefined): EmailLocale =>
  locale === 'en' ? 'en' : 'uk';

const COLORS = {
  page: '#f5f6fa',
  card: '#ffffff',
  text: '#141824',
  muted: '#515a6e',
  line: '#d9dde7',
  accent: '#4f46e5',
  accent2: '#7c3aed',
  onAccent: '#ffffff',
};

const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function layout(
  o: {
    subject: string;
    title: string;
    body: string;
    button: string;
    fallback: string;
    footer: string;
    link: string;
  },
  wolf: string | null,
): RenderedEmail {
  const link = escape(o.link);
  const picture = wolf
    ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 16px"><tr><td width="112" height="112" align="center" valign="middle" style="width:112px;height:112px;background:${COLORS.card};border-radius:56px"><img src="${escape(wolf)}" width="84" alt="" style="display:block;width:84px;height:auto;border:0"></td></tr></table>`
    : '';
  const html = `<!doctype html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(o.subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:24px;overflow:hidden">
<tr><td align="center" style="padding:32px 24px 24px;background:${COLORS.accent};background-image:linear-gradient(135deg,${COLORS.accent},${COLORS.accent2})">
${picture}<div style="font-family:${FONT};font-size:20px;font-weight:700;color:${COLORS.onAccent}">VocabX</div>
</td></tr>
<tr><td style="padding:32px 28px 8px;font-family:${FONT};color:${COLORS.text}">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700">${escape(o.title)}</h1>
<p style="margin:0;font-size:16px;line-height:1.55;color:${COLORS.muted}">${escape(o.body)}</p>
</td></tr>
<tr><td align="center" style="padding:24px 28px">
<a href="${link}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;color:${COLORS.onAccent};text-decoration:none;border-radius:14px;background:${COLORS.accent};background-image:linear-gradient(135deg,${COLORS.accent},${COLORS.accent2})">${escape(o.button)}</a>
</td></tr>
<tr><td style="padding:0 28px 28px;font-family:${FONT};font-size:13px;line-height:1.5;color:${COLORS.muted}">
${escape(o.fallback)}<br><a href="${link}" style="color:${COLORS.accent};word-break:break-all">${link}</a>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid ${COLORS.line};font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.muted}">${escape(o.footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return {
    subject: o.subject,
    html,
    text: `${o.title}\n\n${o.body}\n\n${o.link}\n\n${o.footer}\n`,
  };
}

/** The letter that confirms an address. `wolf`: where the picture is, null to go without. */
export function renderVerifyEmail(
  locale: EmailLocale,
  link: string,
  wolf: string | null,
): RenderedEmail {
  return layout({ ...TEXTS[locale].verify, fallback: TEXTS[locale].fallback, link }, wolf);
}

/** Someone tried to register an address that already has an account. */
export function renderAlreadyEmail(
  locale: EmailLocale,
  link: string,
  wolf: string | null,
): RenderedEmail {
  return layout({ ...TEXTS[locale].already, fallback: TEXTS[locale].fallback, link }, wolf);
}
