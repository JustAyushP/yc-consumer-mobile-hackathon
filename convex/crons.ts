import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("ravo day and pace check", { minuteUTC: 0 }, internal.ravo.entry.dailyCheck, {});

export default crons;
