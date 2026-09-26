import { renderEmailShell } from './base-template.js';

export function renderMagicLinkEmail(link: string, isExistingUser: boolean): string {
  const heading = isExistingUser ? 'Sign in to Nutian' : 'Confirm your email';
  const bodyHtml = isExistingUser
    ? '<p style="margin:0;">Click below to sign in. No password needed.</p>'
    : '<p style="margin:0;">Click below to confirm your email and finish creating your account.</p>';

  return renderEmailShell({
    preheader: isExistingUser ? 'Your Nutian sign-in link' : 'Confirm your Nutian account',
    heading,
    bodyHtml,
    ctaLabel: isExistingUser ? 'Sign in' : 'Confirm email',
    ctaUrl: link,
    footnote: 'This link works once and expires in 15 minutes.',
  });
}
