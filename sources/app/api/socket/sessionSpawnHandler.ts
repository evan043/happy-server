import { ClientConnection, eventRouter } from "@/app/events/eventRouter";
import { log } from "@/utils/log";
import { Socket } from "socket.io";

/**
 * Handler for session:spawn requests from Web UI
 * Calls daemon's spawn-happy-session RPC to create daemon-spawned sessions
 */
export function sessionSpawnHandler(userId: string, socket: Socket, connection: ClientConnection) {
    socket.on('session:spawn', async (data: { directory: string; machineId?: string }, callback: (response: any) => void) => {
        try {
            log({ module: 'websocket' }, `Received session:spawn request from ${socket.id}: directory=${data.directory}`);

            // Find machine-scoped connection for this user
            const connections = eventRouter.getConnections(userId);
            if (!connections) {
                callback({ ok: false, error: 'No daemon connected' });
                return;
            }

            let machineConnection: ClientConnection | undefined;
            for (const conn of connections) {
                if (conn.connectionType === 'machine-scoped') {
                    // If machineId specified, match it; otherwise use first machine
                    if (!data.machineId || conn.machineId === data.machineId) {
                        machineConnection = conn;
                        break;
                    }
                }
            }

            if (!machineConnection || machineConnection.connectionType !== 'machine-scoped') {
                callback({ ok: false, error: 'No daemon available for session spawn' });
                return;
            }

            log({ module: 'websocket' }, `Calling spawn-happy-session RPC on machine ${machineConnection.machineId}`);

            // Call daemon's RPC to spawn session
            try {
                const rpcResponse = await machineConnection.socket.timeout(30000).emitWithAck('rpc-request', {
                    method: 'spawn-happy-session',
                    params: JSON.stringify({
                        directory: data.directory,
                        machineId: machineConnection.machineId
                    })
                });

                // Parse RPC response (daemon returns encrypted JSON string)
                let result;
                try {
                    result = JSON.parse(rpcResponse);
                } catch {
                    result = rpcResponse;
                }

                log({ module: 'websocket' }, `RPC spawn-happy-session response: ${JSON.stringify(result)}`);

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
                log({ module: 'websocket', level: 'error' }, `RPC spawn-happy-session failed: ${rpcError}`);
                callback({ ok: false, error: 'Daemon RPC timeout or error' });
            }
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `Error in session:spawn: ${error}`);
            callback({ ok: false, error: 'Internal server error' });
        }
    });
}
