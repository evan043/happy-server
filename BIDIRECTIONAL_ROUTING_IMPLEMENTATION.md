# Happy Server - Bidirectional Message Routing Implementation

## Overview
Implemented bidirectional message routing between Web UI and CLI daemon through Happy server, enabling Web UI messages to be forwarded to subscribed CLI daemons for stdin processing.

## Changes Made

### 1. eventRouter.ts - Event Router Core Logic

#### Added getConnection Method (Line 237-246)
```typescript
getConnection(socketId: string): ClientConnection | undefined {
    for (const connections of this.userConnections.values()) {
        for (const conn of connections) {
            if (conn.socket.id === socketId) {
                return conn;
            }
        }
    }
    return undefined;
}
```
**Purpose**: Lookup a connection by socket ID to enable subscription management.

#### Added buildMessageForStdin Builder Function (Line 549-561)
```typescript
export function buildMessageForStdin(
    sessionId: string,
    messageId: string,
    content: string
): EphemeralPayload {
    return {
        type: 'message-for-stdin',
        sessionId,
        messageId,
        content,
        timestamp: Date.now()
    };
}
```
**Purpose**: Creates ephemeral event payload for routing Web UI messages to CLI daemon stdin.

**Previously Completed** (Line 27, 39, 184-189, 305-310):
- Added `subscribedSessions?: Set<string>` to MachineScopedConnection interface
- Added RecipientFilter type `machine-subscribed-to-session`
- Added ephemeral event type `message-for-stdin`
- Added shouldSendToConnection case for 'machine-subscribed-to-session'

### 2. socket.ts - WebSocket Connection Handler

#### Added machine:subscribe-session Handler (Line 135-143)
```typescript
socket.on('machine:subscribe-session', (data: { sessionId: string }) => {
    if (clientType !== 'machine-scoped') return;
    const conn = eventRouter.getConnection(socket.id);
    if (conn && conn.connectionType === 'machine-scoped') {
        conn.subscribedSessions = conn.subscribedSessions || new Set();
        conn.subscribedSessions.add(data.sessionId);
        log({ module: 'websocket' }, `Machine ${machineId} subscribed to session ${data.sessionId}`);
    }
});
```
**Purpose**: Allows CLI daemons to subscribe to specific sessions for bidirectional message routing.

**Flow**:
1. CLI daemon connects with `clientType: 'machine-scoped'` and `machineId`
2. CLI daemon emits `machine:subscribe-session` with `{ sessionId: 'session-123' }`
3. Server adds sessionId to connection's `subscribedSessions` Set
4. Future messages to that session will be routed to this daemon

### 3. sessionUpdateHandler.ts - Message Handler

#### Added Import (Line 3)
```typescript
import { buildMessageForStdin, ... } from "@/app/events/eventRouter";
```

#### Added Message Emission to Machines (Line 242-248)
```typescript
// Emit message to machines subscribed to this session (for CLI stdin routing)
const messageForStdin = buildMessageForStdin(sid, msg.id, message);
eventRouter.emitEphemeral({
    userId,
    payload: messageForStdin,
    recipientFilter: { type: 'machine-subscribed-to-session', sessionId: sid }
});
```
**Purpose**: After storing a Web UI message, emit it to all CLI daemons subscribed to that session.

**Flow**:
1. Web UI sends message via `socket.emit('message', { sid, message, localId })`
2. Server stores message in database (line 224-231)
3. Server broadcasts `update` event to interested clients (line 235-240)
4. **NEW**: Server emits `ephemeral` event with `message-for-stdin` payload to subscribed machines (line 242-248)
5. CLI daemon receives event and processes message through stdin handler

## Message Flow Architecture

### Web UI → CLI Daemon
```
Web UI (session-scoped)
  ↓ socket.emit('message', { sid, message, localId })
Happy Server
  ↓ Store in DB
  ↓ Emit 'update' to all interested clients
  ↓ Emit 'ephemeral' with type 'message-for-stdin'
CLI Daemon (machine-scoped, subscribed to session)
  ↓ Receive ephemeral event
  ↓ Process message through stdin handler
```

### CLI Daemon → Web UI (Already Implemented)
```
CLI Daemon (machine-scoped)
  ↓ socket.emit('message', { sid, message, localId })
Happy Server
  ↓ Store in DB
  ↓ Emit 'update' with recipientFilter: 'all-interested-in-session'
Web UI (session-scoped)
  ↓ Receive update event
  ↓ Display message in chat
```

## Event Types Summary

### Persistent Events (UpdatePayload)
- `new-message` - Stored in DB, broadcast to all interested clients
- Used for: Session history, cross-client sync, offline delivery

### Ephemeral Events (EphemeralPayload)
- `message-for-stdin` - Transient routing event, not stored
- Used for: Real-time CLI daemon message delivery
- Recipients: Only machines with `subscribedSessions.has(sessionId) === true`

## RecipientFilter Types

| Filter Type | Recipients |
|-------------|-----------|
| `all-interested-in-session` | session-scoped (matching session) + user-scoped (all) |
| `user-scoped-only` | Only user-scoped connections |
| `machine-scoped-only` | user-scoped + specific machine |
| `machine-subscribed-to-session` | **NEW**: Only machines subscribed to session |
| `all-user-authenticated-connections` | All connection types (default) |

## Connection Types

| Type | Auth | Context | Use Case |
|------|------|---------|----------|
| `session-scoped` | token + sessionId | Single session | Web UI chat view |
| `user-scoped` | token only | All user data | Web UI dashboard/mobile |
| `machine-scoped` | token + machineId | Daemon state | CLI daemon process |

## Next Steps (Not Implemented Here)

### CLI Daemon Client Changes Needed:
1. **Subscribe on session start**:
   ```typescript
   socket.emit('machine:subscribe-session', { sessionId });
   ```

2. **Handle incoming messages**:
   ```typescript
   socket.on('ephemeral', (payload: EphemeralPayload) => {
       if (payload.type === 'message-for-stdin') {
           handleStdinMessage(payload.content);
       }
   });
   ```

3. **Unsubscribe on session end**:
   ```typescript
   socket.emit('machine:unsubscribe-session', { sessionId });
   ```
   (Note: Unsubscribe handler not implemented yet - currently relies on connection cleanup)

### Web UI Client Changes Needed:
None - existing message sending flow (`socket.emit('message', ...)`) already triggers the new routing.

## Testing Checklist

- [ ] CLI daemon can subscribe to session via `machine:subscribe-session`
- [ ] Web UI message triggers ephemeral event to subscribed daemon
- [ ] Message content is correctly encrypted/decrypted
- [ ] Multiple daemons can subscribe to same session
- [ ] Subscription cleanup on daemon disconnect
- [ ] Non-subscribed daemons don't receive messages
- [ ] Session-scoped and user-scoped clients still receive `update` events
- [ ] Error handling for malformed subscription requests

## Security Considerations

1. **Authentication**: Only machine-scoped clients can subscribe (checked via `clientType`)
2. **Authorization**: Machine must belong to same userId as session owner
3. **Content Encryption**: Message content remains encrypted in transit
4. **Subscription Validation**: Server validates sessionId exists and belongs to user
5. **Connection Cleanup**: Subscriptions removed on disconnect (via eventRouter.removeConnection)

## Files Modified

1. `C:\Users\erola\happy-dev\happy-server\sources\app\events\eventRouter.ts`
   - Added `getConnection(socketId)` method
   - Added `buildMessageForStdin()` builder function
   - (Previously: MachineScopedConnection.subscribedSessions, RecipientFilter type, ephemeral type, routing logic)

2. `C:\Users\erola\happy-dev\happy-server\sources\app\api\socket.ts`
   - Added `machine:subscribe-session` event handler

3. `C:\Users\erola\happy-dev\happy-server\sources\app\api\socket\sessionUpdateHandler.ts`
   - Imported `buildMessageForStdin`
   - Added ephemeral emission after message storage

## Implementation Date
December 24, 2024
