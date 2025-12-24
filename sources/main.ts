// ===============================================
// BUILD MARKER: 2024-12-24 12:40:00 CST
// If you see this in logs, NEW CODE IS RUNNING!
// ===============================================
console.log('==================================================');
console.log('HAPPY-SERVER BUILD: 2024-12-24 12:40:00 CST');
console.log('NEW CODE DEPLOYED SUCCESSFULLY!');
console.log('==================================================');

import { startApi } from "@/app/api/api";
import { log } from "@/utils/log";
import { awaitShutdown, onShutdown } from "@/utils/shutdown";
import { db } from './storage/db';
import { startTimeout } from "./app/presence/timeout";
import { redis } from "./storage/redis";
import { startMetricsServer } from "@/app/monitoring/metrics";
import { activityCache } from "@/app/presence/sessionCache";
import { auth } from "./app/auth/auth";
import { startDatabaseMetricsUpdater } from "@/app/monitoring/metrics2";
import { initEncrypt } from "./modules/encrypt";
import { initGithub } from "./modules/github";
import { loadFiles } from "./storage/files";

async function main() {

    // Storage
    await db.$connect();
    onShutdown('db', async () => {
        await db.$disconnect();
    });
    onShutdown('activity-cache', async () => {
        activityCache.shutdown();
    });
    await redis.ping();

    // Initialize auth module
    await initEncrypt();
    await initGithub();
    await loadFiles();
    auth.init();

    // Timeout loop
    await startTimeout();

    // Api
    await startApi();
    log({ module: 'main' }, `Server started`);

    // Metrics
    startMetricsServer();
    startDatabaseMetricsUpdater();

    // Await shutdown
    await awaitShutdown();
}

main();
