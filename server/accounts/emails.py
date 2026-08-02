from django.utils.html import escape

from backend.mail import send_app_email


def send_verification_code_email(*, to_email: str, first_name: str, code: str) -> bool:
    name = (first_name or '').strip() or 'there'
    subject = f'{code} is your Photolux Oxford verification code'
    text_body = (
        f'Hi {name},\n\n'
        f'Your verification code is: {code}\n\n'
        f'This code expires in 15 minutes.\n\n'
        f'If you did not create an account, you can ignore this email.\n\n'
        f'— Photolux Oxford Photography\n'
    )
    safe_name = escape(name)
    safe_code = escape(code)
    html_body = f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #eee;">
          <tr>
            <td style="padding:28px 28px 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#888;">
              Photolux Oxford Photography
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-size:22px;font-weight:300;color:#111;letter-spacing:-0.02em;">
              Verify your email
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 0;font-size:14px;line-height:1.6;color:#444;">
              Hi {safe_name}, use this code to finish creating your account:
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px;">
              <div style="display:inline-block;padding:14px 28px;background:#111;color:#fff;font-size:28px;letter-spacing:0.35em;font-weight:600;">
                {safe_code}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;font-size:13px;line-height:1.5;color:#888;">
              This code expires in 15 minutes. If you did not register, you can ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return send_app_email(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )
