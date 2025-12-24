import { z } from 'zod';
import { Fastify } from '../types';
import { db } from '@/storage/db';
import { auth } from '@/app/auth/auth';
import { log } from '@/utils/log';
import * as crypto from 'crypto';

export function devRoutes(app: Fastify) {

    // Bootstrap endpoint for self-hosted servers (only when explicitly enabled)
    if (process.env.ALLOW_BOOTSTRAP === 'true') {
        log({ module: 'bootstrap' }, 'ALLOW_BOOTSTRAP is enabled - bootstrap endpoint is accessible');

        app.post('/v1/bootstrap', {
            schema: {
                body: z.object({
                    username: z.string().optional()
                }).optional(),
                response: {
                    200: z.object({
                        success: z.literal(true),
                        token: z.string(),
                        accountId: z.string(),
                        message: z.string()
                    }),
                    403: z.object({
                        error: z.string()
                    })
                }
            }
        }, async (request, reply) => {
            log({ module: 'bootstrap' }, 'Bootstrap auth request received');

            const username = request.body?.username || 'admin';

            // First check if account with this username already exists
            let account = await db.account.findFirst({
                where: { username }
            });

            if (account) {
                log({ module: 'bootstrap' }, `Found existing account: ${account.id}`);
            } else {
                // Create new account with random public key
                const publicKeyBytes = crypto.randomBytes(32);
                const publicKeyHex = publicKeyBytes.toString('hex');

                account = await db.account.create({
                    data: {
                        publicKey: publicKeyHex,
                        username
                    }
                });
                log({ module: 'bootstrap' }, `Created new account: ${account.id}`);
            }

            const token = await auth.createToken(account.id);

            log({ module: 'bootstrap' }, `Bootstrap successful for account: ${account.id}`);

            return reply.send({
                success: true as const,
                token,
                accountId: account.id,
                message: 'Bootstrap successful. Save this token in ~/.happy/access.key'
            });
        });
    }

    // Combined logging endpoint (only when explicitly enabled)
    if (process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING) {
        app.post('/logs-combined-from-cli-and-mobile-for-simple-ai-debugging', {
            schema: {
                body: z.object({
                    timestamp: z.string(),
                    level: z.string(),
                    message: z.string(),
                    messageRawObject: z.any().optional(),
                    source: z.enum(['mobile', 'cli']),
                    platform: z.string().optional()
                })
            }
        }, async (request, reply) => {
            const { timestamp, level, message, source, platform } = request.body;

            // Log ONLY to separate remote logger (file only, no console)
            const logData = {
                source,
                platform,
                timestamp
            };

            // Use the file-only logger if available
            const { fileConsolidatedLogger } = await import('@/utils/log');

            if (!fileConsolidatedLogger) {
                // Should never happen since we check env var above, but be safe
                return reply.send({ success: true });
            }

            switch (level.toLowerCase()) {
                case 'error':
                    fileConsolidatedLogger.error(logData, message);
                    break;
                case 'warn':
                case 'warning':
                    fileConsolidatedLogger.warn(logData, message);
                    break;
                case 'debug':
                    fileConsolidatedLogger.debug(logData, message);
                    break;
                default:
                    fileConsolidatedLogger.info(logData, message);
            }

            return reply.send({ success: true });
        });
    }
}
