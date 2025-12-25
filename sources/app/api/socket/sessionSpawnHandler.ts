import { ClientConnection, eventRouter, MachineScopedConnection } from "@/app/events/eventRouter";
import { log } from "@/utils/log";
import { Socket } from "socket.io";

/**
 * Handler for session:spawn requests from Web UI
 * Calls daemon's spawn-happy-session RPC to create daemon-spawned sessions
 * 
 * CROSS-USER MACHINE LOOKUP: If no machine is found for the requesting user,
 * we search across ALL connected machines (any user) since web UI and daemon
 * may authenticate with different userIds.
 */
export function sessionSpawnHandler(userId: string, socket: Socket, connection: ClientConnection) {
    log({ module: 'websocket' }, `[SESSION SPAWN HANDLER] Registering session:spawn handler for socket ${socket.id}, userId: ${userId}, connectionType: ${connection.connectionType}`);

    // DEBUG: Log ALL events received on this socket (MUST be outside the event handler!)
    socket.onAny((eventName, ...args) => {
        log({ module: 'websocket' }, `[SOCKET DEBUG] Event: ${eventName}, args: ${args.length}, socketId: ${socket.id}, userId: ${userId}`);
    });

    socket.on('session:spawn', async (data: { directory: string; machineId?: string }, callback: (response: any) => void) => {
        try {
            log({ module: 'websocket' }, `[SESSION SPAWN] Received request from ${socket.id} (userId: ${userId}): directory=${data.directory}, machineId=${data.machineId || 'any'}`);

            // First: Try to find machine-scoped connection for this specific user
            const connections = eventRouter.getConnections(userId);
            log({ module: 'websocket' }, `[SESSION SPAWN] Found ${connections?.size || 0} connections for user ${userId}`);

            let machineConnection: MachineScopedConnection | undefined;

            // Debug: log all user connections
            if (connections) {
                for (const conn of connections) {
                    log({ module: 'websocket' }, `[SESSION SPAWN] User connection - type: ${conn.connectionType}, socketId: ${conn.socket.id}${conn.connectionType === 'machine-scoped' ? `, machineId: ${conn.machineId}` : ''}`);
                    if (conn.connectionType === 'machine-scoped') {
                        if (!data.machineId || conn.machineId === data.machineId) {
                            machineConnection = conn;
                            log({ module: 'websocket' }, `[SESSION SPAWN] Found machine in user's connections: ${conn.machineId}`);
                            break;
                        }
                    }
                }
            }

            // Second: If no machine found for this user, search ALL users
            // This handles the case where daemon and web UI authenticate with different userIds
            if (!machineConnection) {
                log({ module: 'websocket' }, `[SESSION SPAWN] No machine found for user ${userId}, searching across ALL users...`);
                const allMachines = eventRouter.getAllMachineConnections();
                log({ module: 'websocket' }, `[SESSION SPAWN] Found ${allMachines.length} total machine connections across all users`);

                for (const machine of allMachines) {
                    log({ module: 'websocket' }, `[SESSION SPAWN] Available machine: machineId=${machine.machineId}, userId=${machine.userId}`);
                    if (!data.machineId || machine.machineId === data.machineId) {
                        machineConnection = machine;
                        log({ module: 'websocket' }, `[SESSION SPAWN] Selected cross-user machine: ${machine.machineId} (userId: ${machine.userId})`);
                        break;
                    }
                }
            }

            if (!machineConnection) {
                log({ module: 'websocket', level: 'error' }, `[SESSION SPAWN] No machine-scoped connection found anywhere`);
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
// Force rebuild - CROSS-USER MACHINE LOOKUP enabled
