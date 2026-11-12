import nodemailer from 'nodemailer';
import type { RenderedEmail } from './email-templates';

const WOLF_CID = 'wolf@vocabx';
export const WOLF_SRC = `cid:${WOLF_CID}`;

/** The site's own address: links in letters never trust the address a request came in on. */
export const siteUrl = () =>
  (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * The picture travels inside the letter, so it shows without loading anything from outside (and
 * from localhost too). Made small by the app's own image service; a letter without it still works.
 */
async function wolfPicture(): Promise<Buffer | null> {
  try {
    const src = encodeURIComponent('/male/_wolf/wolf_head_joy.png');
    const res = await fetch(`${siteUrl()}/_next/image?url=${src}&w=256&q=75`, {
      headers: { Accept: 'image/png' },
    });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export class EmailNotSent extends Error {}

/**
 * Sends a letter through SMTP (EMAIL_SERVER_USER and EMAIL_SERVER_PASSWORD; Gmail unless
 * EMAIL_SERVER_HOST says otherwise). Without them, outside production, the link goes to the
 * server's console, so signing up can be tried locally with no mail account.
 */
export async function sendEmail(
  to: string,
  render: (wolf: string | null) => RenderedEmail,
  link: string,
): Promise<void> {
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  if (!user || !pass) {
    if (process.env.NODE_ENV === 'production') throw new EmailNotSent('not configured');
    // Local only (production throws above): the link is what a developer needs, not the address.
    console.info(`[email] ${link}`);
    return;
  }
  const picture = await wolfPicture();
  const { subject, html, text } = render(picture ? WOLF_SRC : null);
  const transport = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.EMAIL_SERVER_PORT ?? 465),
    secure: Number(process.env.EMAIL_SERVER_PORT ?? 465) === 465,
    auth: { user, pass },
  });
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM ?? `VocabX <${user}>`,
      to,
      subject,
      html,
      text,
      ...(picture
        ? { attachments: [{ filename: 'wolf.png', content: picture, cid: WOLF_CID }] }
        : {}),
    });
  } catch (e) {
    // The server's own text may quote the address: keep only the SMTP code.
    const code = e as { responseCode?: number; code?: string };
    throw new EmailNotSent(`send failed ${code.responseCode ?? code.code ?? ''}`.trim());
  }
}
