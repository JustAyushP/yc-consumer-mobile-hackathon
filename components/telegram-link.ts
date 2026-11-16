export const TELEGRAM_URL = "https://t.me/ravo_sal_demo_bot";

export const TELEGRAM_BOTS = [
  { lineId: "1", label: "Chat with Sal", handle: "ravo_sal_demo_bot", url: TELEGRAM_URL },
  { lineId: "2", label: "Chat with Vivian Cross", handle: "ravo_lucy_demo_bot", url: "https://t.me/ravo_lucy_demo_bot" },
  { lineId: "3", label: "Chat with Leo Marlowe", handle: "ravo_marlow_demo_bot", url: "https://t.me/ravo_marlow_demo_bot" },
] as const;

export async function openTelegram(openURL: (url: string) => Promise<unknown>, url: string = TELEGRAM_URL): Promise<boolean> {
  try {
    await openURL(url);
    return true;
  } catch {
    return false;
  }
}
