import assert from "node:assert/strict";
import test from "node:test";
import { openTelegram, TELEGRAM_URL } from "./telegram-link.ts";

test("opens only the Telegram demo bot without viewer details", async () => {
  const opened = [];
  assert.equal(await openTelegram(async url => { opened.push(url); }), true);
  assert.deepEqual(opened, ["https://t.me/ravo_sal_demo_bot"]);
  assert.equal(TELEGRAM_URL, "https://t.me/ravo_sal_demo_bot");
});

test("reports an opening failure", async () => {
  assert.equal(await openTelegram(async () => { throw new Error("unavailable"); }), false);
});
