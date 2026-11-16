export const TELEGRAM_URL = "https://t.me/ravo_sal_demo_bot";

export async function openTelegram(openURL: (url: string) => Promise<unknown>): Promise<boolean> {
  try {
    await openURL(TELEGRAM_URL);
    return true;
  } catch {
    return false;
  }
}
