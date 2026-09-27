import { renderEmailShell } from './base-template.js';

export function renderMagicLinkEmail(link: string, isExistingUser: boolean): string {
  const heading = isExistingUser ? 'Sign in to Levy' : 'Confirm your email';
  const bodyHtml = isExistingUser
    ? '<p style="margin:0;">Click below to sign in. No password needed.</p>'
    : '<p style="margin:0;">Click below to confirm your email and finish creating your account.</p>';

  return renderEmailShell({
    preheader: isExistingUser ? 'Your Levy sign-in link' : 'Confirm your Levy account',
    heading,
    bodyHtml,
    ctaLabel: isExistingUser ? 'Sign in' : 'Confirm email',
    ctaUrl: link,
    footnote: 'This link works once and expires in 15 minutes.',
  });
}
