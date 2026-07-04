module.exports = function verificationOtpTemplate({
    name = "User",
    otp,
    expiry = 10,
}) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Email Verification</title>
</head>

<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:40px 0;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0"
style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.08);">

<tr>
<td style="background:#1f2937;padding:35px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:28px;">
VPS Global
</h1>
<p style="margin-top:8px;color:#d1d5db;font-size:15px;">
Email Verification
</p>
</td>
</tr>

<tr>
<td style="padding:40px;">

<h2 style="margin-top:0;color:#111827;">
Hello ${name},
</h2>

<p style="color:#4b5563;font-size:16px;line-height:1.7;">
Thank you for registering with <strong>VPS Global</strong>.
To verify your email address, please use the One-Time Password (OTP) below.
</p>

<div style="margin:35px 0;text-align:center;">

<div
style="
display:inline-block;
background:#2563eb;
color:#ffffff;
font-size:36px;
font-weight:bold;
letter-spacing:10px;
padding:20px 40px;
border-radius:10px;
">
${otp}
</div>

</div>

<p style="color:#4b5563;font-size:16px;">
This OTP will expire in
<strong>${expiry} minutes</strong>.
</p>

<p style="color:#4b5563;font-size:16px;">
If you did not request this verification, you can safely ignore this email.
No further action is required.
</p>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:35px 0;">

<p style="color:#6b7280;font-size:13px;line-height:1.7;">
This is an automated email. Please do not reply.
</p>

</td>
</tr>

<tr>
<td
style="
background:#f9fafb;
padding:20px;
text-align:center;
font-size:13px;
color:#6b7280;
">

© ${new Date().getFullYear()} VPS Global. All rights reserved.

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;
};