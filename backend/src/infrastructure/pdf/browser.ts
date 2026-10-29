import type { Browser } from 'puppeteer-core';

/**
 * Lance Chrome sans interface pour le rendu PDF.
 * - Local / serveur classique : Chrome fourni par `puppeteer`.
 * - Vercel (ou SERVERLESS_CHROMIUM=1) : Chromium allégé de `@sparticuz/chromium`, le seul exécutable dans une fonction serverless.
 */
export async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL || process.env.SERVERLESS_CHROMIUM === '1') {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = await import('puppeteer-core');
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true }) as unknown as Browser;
  }
  const puppeteer = (await import('puppeteer')).default;
  return puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }) as unknown as Browser;
}
