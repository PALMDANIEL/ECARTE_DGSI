import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../logger';
const transporter = nodemailer.createTransport({ host: config.email.host, port: config.email.port, secure: config.email.port === 465, auth: { user: config.email.user, pass: config.email.pass } });
export class EmailService {
  async sendVerificationEmail(to: string, token: string) { await this.sendMail(to, 'Verifiez votre email', 'Cliquez ici: ' + config.frontendUrl + '/verify?token=' + token); }
  async sendPasswordResetEmail(to: string, token: string) { await this.sendMail(to, 'Reinitialisation mot de passe', 'Cliquez ici: ' + config.frontendUrl + '/reset-password?token=' + token); }
  private async sendMail(to: string, subject: string, text: string) { try { await transporter.sendMail({ from: config.email.user, to, subject, text }); } catch (error) { logger.error('Email failed', { error, to }); } }
}
