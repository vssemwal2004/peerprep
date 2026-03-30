import 'dotenv/config';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  tls: { rejectUnauthorized: false }
});

console.log('SMTP Config:');
console.log('  Host:', process.env.SMTP_HOST);
console.log('  Port:', process.env.SMTP_PORT);
console.log('  User:', process.env.SMTP_USER);
console.log('  Pass:', process.env.SMTP_PASS ? '****' + process.env.SMTP_PASS.slice(-4) : 'NOT SET');
console.log('\nVerifying SMTP connection...');

try {
  const result = await transporter.verify();
  console.log('\n✅ SMTP connection successful! Server is ready to send emails.');
} catch (err) {
  console.error('\n❌ SMTP connection failed!');
  console.error('  Error:', err.message);
  if (err.code) console.error('  Code:', err.code);
} finally {
  transporter.close();
}
