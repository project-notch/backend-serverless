import { renderEmailShell } from './base-template.js';

export function renderPasswordResetEmail(link: string): string {
  return renderEmailShell({
    preheader: 'Reset your Nutian password',
    heading: 'Reset your password',
    bodyHtml: '<p style="margin:0;">Click below to choose a new password.</p>',
    ctaLabel: 'Choose new password',
    ctaUrl: link,
    footnote: "This link works once and expires in 15 minutes. Your current password stays active until you finish.",
  });
}
