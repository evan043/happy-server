import { ClientConnection, eventRouter } from "@/app/events/eventRouter";
import { log } from "@/utils/log";
import { Socket } from "socket.io";

/**
 * Handler for session:spawn requests from Web UI
 * Calls daemon's spawn-happy-session RPC to create daemon-spawned sessions
 */
export function sessionSpawnHandler(userId: string, socket: Socket, connection: ClientConnection) {
    // CRITICAL DEBUG: Bypass pino to confirm handler is called
    console.log(`[DEBUG-2024-12-24-BYPASS] sessionSpawnHandler CALLED - socket: ${socket.id}, userId: ${userId}, type: ${connection.connectionType}`);
    log({ module: 'websocket' }, `[SESSION SPAWN HANDLER] Registering session:spawn handler for socket ${socket.id}, userId: ${userId}, connectionType: ${connection.connectionType}`);

    // DEBUG: Log ALL events received on this socket (MUST be outside the event handler!)
    socket.onAny((eventName, ...args) => {
        log({ module: 'websocket' }, `[SOCKET DEBUG] Event: ${eventName}, args: ${args.length}, socketId: ${socket.id}, userId: ${userId}`);
    });

    socket.on('session:spawn', async (data: { directory: string; machineId?: string }, callback: (response: any) => void) => {
        try {
            log({ module: 'websocket' }, `[SESSION SPAWN] Received request from ${socket.id} (userId: ${userId}): directory=${data.directory}, machineId=${data.machineId || 'any'}`);

            // Find machine-scoped connection for this user
            const connections = eventRouter.getConnections(userId);
            log({ module: 'websocket' }, `[SESSION SPAWN] Found ${connections?.size || 0} total connections for user ${userId}`);

            if (!connections) {
                log({ module: 'websocket', level: 'error' }, `[SESSION SPAWN] No connections found for user ${userId}`);
                callback({ ok: false, error: 'No daemon connected' });
                return;
            }

            // Debug: log all connections
            for (const conn of connections) {
                log({ module: 'websocket' }, `[SESSION SPAWN] Connection type: ${conn.connectionType}, socketId: ${conn.socket.id}, userId: ${conn.userId}${conn.connectionType === 'machine-scoped' ? `, machineId: ${conn.machineId}` : ''}`);
            }

            let machineConnection: ClientConnection | undefined;
            for (const conn of connections) {
                if (conn.connectionType === 'machine-scoped') {
                    log({ module: 'websocket' }, `[SESSION SPAWN] Found machine-scoped connection: machineId=${conn.machineId}, requested=${data.machineId || 'any'}`);
                    // If machineId specified, match it; otherwise use first machine
                    if (!data.machineId || conn.machineId === data.machineId) {
                        machineConnection = conn;
                        log({ module: 'websocket' }, `[SESSION SPAWN] Selected machine ${conn.machineId} for spawn`);
                        break;
                    }
                }
            }

            if (!machineConnection || machineConnection.connectionType !== 'machine-scoped') {
                log({ module: 'websocket', level: 'error' }, `[SESSION SPAWN] No machine-scoped connection found (total machine connections: ${Array.from(connections).filter(c => c.connectionType === 'machine-scoped').length})`);
                callback({ ok: false, error: 'No daemon available for session spawn' });
                return;
            }

            log({ module: 'websocket' }, `[SESSION SPAWN] Calling spawn-happy-session RPC on machine ${machineConnection.machineId} (socket ${machineConnection.socket.id})`);
            log({ module: 'websocket' }, `[SESSION SPAWN] RPC params: directory=${data.directory}, machineId=${machineConnection.machineId}`);

            // Call daemon's RPC to spawn session
            try {
                log({ module: 'websocket' }, `[SESSION SPAWN] Emitting rpc-request event with 30s timeout...`);
                const rpcResponse = await machineConnection.socket.timeout(30000).emitWithAck('rpc-request', {
                    method: 'spawn-happy-session',
                    params: JSON.stringify({
                        directory: data.directory,
                        machineId: machineConnection.machineId
                    })
                });
                log({ module: 'websocket' }, `[SESSION SPAWN] RPC response received`);

                // Parse RPC response (daemon returns encrypted JSON string)
                let result;
                try {
                    result = JSON.parse(rpcResponse);
                } catch {
                    result = rpcResponse;
                }

                log({ module: 'websocket' }, `[SESSION SPAWN] Parsed RPC response successfully`);

                if (result.ok && result.result) {
                    const innerResult = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
                    if (innerResult.type === 'success') {
                        callback({ ok: true, sessionId: innerResult.sessionId });
                    } else if (innerResult.type === 'requestToApproveDirectoryCreation') {
                        callback({ ok: false, error: 'Directory creation requires approval', directory: innerResult.directory });
                    } else {
                        callback({ ok: false, error: innerResult.error || 'Unknown spawn error' });
                    }
                } else {
                    callback({ ok: false, error: result.error || 'RPC call failed' });
                }
            } catch (rpcError) {
                log({ module: 'websocket', level: 'error' }, `[SESSION SPAWN] RPC spawn-happy-session failed: ${rpcError}`);
                callback({ ok: false, error: 'Daemon RPC timeout or error' });
            }
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `[SESSION SPAWN] Error in session:spawn handler: ${error}`);
            callback({ ok: false, error: 'Internal server error' });
        }
    });
}
// Force rebuild Wed, Dec 24, 2025 12:25:00 PM - CONSOLE.LOG DEBUG
