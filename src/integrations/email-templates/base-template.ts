/**
 * Shared HTML shell for every transactional email — same design tokens as
 * the mobile app (AppColors in tokens.dart) and the privacy-policy page:
 * cream background, white card, thin black border, purple accent CTA,
 * light-weight ink body text. Table-based layout + all-inline styles
 * deliberately, not a <style> block — Outlook and a lot of webmail clients
 * strip or mangle <style>, and this only ever needs to render correctly
 * once, in an inbox, not evolve like a real webpage.
 */

const COLORS = {
  bg: '#EEECE5',
  surface: '#FFFFFF',
  ink: '#16151B',
  inkSoft: '#6F6C66',
  line: '#16151B',
  accent: '#8479EF',
  accentDark: '#6D61E9',
} as const;

export interface EmailShellOptions {
  /** Shown in the inbox preview line, hidden in the rendered email itself. */
  preheader: string;
  heading: string;
  /** Already-escaped inline HTML — paragraphs, bold, etc. */
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  /** Small print under the button — e.g. "Expires in 15 minutes." */
  footnote?: string;
}

export function renderEmailShell(opts: EmailShellOptions): string {
  const { preheader, heading, bodyHtml, ctaLabel, ctaUrl, footnote } = opts;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${heading}</title>
</head>
<body style="margin:0; padding:0; background-color:${COLORS.bg}; font-family: Arial, Helvetica, sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.bg};">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%;">
          <tr>
            <td style="padding-bottom: 20px;" align="left">
              <span style="font-size:20px; font-weight:800; color:${COLORS.ink}; letter-spacing:-0.2px;">Nutian</span>
            </td>
          </tr>
          <tr>
            <td style="background-color:${COLORS.surface}; border:1.2px solid ${COLORS.line}; border-radius:20px; padding:32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:22px; font-weight:800; color:${COLORS.ink}; padding-bottom:12px;">
                    ${heading}
                  </td>
                </tr>
                <tr>
                  <td style="font-size:15px; font-weight:400; line-height:1.6; color:${COLORS.ink};">
                    ${bodyHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:24px; padding-bottom: ${footnote ? '10' : '0'}px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color:${COLORS.accent}; border-radius:12px;">
                          <a href="${ctaUrl}" style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">${ctaLabel}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${
                  footnote
                    ? `<tr>
                  <td style="font-size:13px; color:${COLORS.inkSoft}; padding-bottom:14px;">${footnote}</td>
                </tr>`
                    : ''
                }
                <tr>
                  <td style="font-size:12.5px; color:${COLORS.inkSoft}; line-height:1.5;">
                    Button not clickable? Copy this link into your browser:<br />
                    <span style="word-break:break-all;">${ctaUrl}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px; text-align:center;">
              <p style="margin:0; font-size:12.5px; color:${COLORS.inkSoft}; line-height:1.6;">
                Didn't request this? You can safely ignore this email.<br />
                Need help? <a href="mailto:team.creativefluxx@gmail.com" style="color:${COLORS.accentDark};">team.creativefluxx@gmail.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
