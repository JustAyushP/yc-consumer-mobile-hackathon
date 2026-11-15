import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("ravo daily check", { hourUTC: 15, minuteUTC: 0 }, internal.ravo.entry.dailyCheck, {});

export default crons;
