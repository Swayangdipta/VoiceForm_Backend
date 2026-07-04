const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true", // false for port 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

transporter.verify((error) => {
    if (error) {
        console.error("SMTP Connection Error:", error);
    } else {
        console.log("SMTP Server is ready.");
    }
});

async function sendEmail({
    to,
    subject,
    html,
    text = "",
    from = `"Visa Passport Services" <info@vpsglobal.co.in>`,
}) {
    try {
        const info = await transporter.sendMail({
            from,
            to,
            subject,
            text,
            html,
        });

        return {
            success: true,
            messageId: info.messageId,
        };
    } catch (error) {
        console.error(error);

        return {
            success: false,
            error,
        };
    }
}

module.exports = sendEmail;