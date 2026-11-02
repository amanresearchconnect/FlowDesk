# System architecture

## Architecture style

FlowDesk uses a modular monolith architecture. The application deploys as two Node.js runtime instances: an HTTP/WebSocket API service and a dedicated background worker service. Both runtimes share a single domain model, database, and Redis cache.

This pattern provides operational simplicity for a solo developer while maintaining clean module boundaries that prevent coupling.

```mermaid
graph TD
    subgraph Client ["Client Layer"]
        SPA["React 19 SPA (Vite + Tailwind CSS v4)"]
    end

    subgraph API ["API Process (Node.js / Express)"]
        GW["Express Gateway / Middlewares"]
        AuthMod["Auth & User Module"]
        ContactMod["Contact Module"]
        CampMod["Campaign Module"]
        ConvMod["Conversation & Inbox Module"]
        MsgMod["Messaging Module"]
        HookMod["Webhook Ingestion Engine"]
        SocketServer["Socket.IO Server"]
    end

    subgraph Worker ["Worker Process (BullMQ Runner)"]
        WFEngine["Workflow Execution Engine"]
        AIEngine["AI Agent Engine"]
        QueueWorkers["Queue Processors"]
        ExtSync["External Integration Adapters"]
    end

    subgraph Storage ["Persistence & Broker Layer"]
        MongoDB[("MongoDB 7.0+ (Mongoose)")]
        RedisDB[("Redis 7.0+ (BullMQ + Cache)")]
    end

    subgraph External ["External Services"]
        MockWA["Mock WhatsApp Service"]
        MetaWA["Meta WhatsApp Cloud API"]
        GraphAPI["Microsoft Graph (Excel Online)"]
        LLMProvider["LLM API (Gemini / OpenAI / Mock)"]
    end

    SPA -->|HTTPS / REST| GW
    SPA <-->|WSS / Socket.IO| SocketServer
    GW --> AuthMod & ContactMod & CampMod & ConvMod & MsgMod & HookMod
    HookMod -->|Ingest Events| RedisDB
    CampMod -->|Dispatch Jobs| RedisDB
    QueueWorkers --> WFEngine & AIEngine & ExtSync
    WFEngine --> MongoDB & RedisDB
    MsgMod --> MockWA & MetaWA
    ExtSync --> GraphAPI
    AIEngine --> LLMProvider
    ConvMod --> SocketServer
    SocketServer -->|Real-time Updates| SPA
```

## Module boundaries and responsibilities

| Module | Core responsibilities | Inbound dependencies | Outbound dependencies |
|---|---|---|---|
| `auth` | User registration, authentication, JWT tokens, RBAC guard | API Gateway | MongoDB |
| `contacts` | CSV/Excel ingestion, E.164 normalization, deduplication, contact tagging | API Gateway, Campaign Module | MongoDB |
| `campaigns` | Campaign lifecycle, target segmentation, dispatch scheduling, counters | API Gateway, Workflow Module | Contacts, MongoDB, Redis (BullMQ) |
| `messaging` | Provider abstraction, dispatch rate limiting, status tracking | Campaigns, Conversations, Workflow | Redis, MockWA, MetaWA, MongoDB |
| `whatsapp` | Meta Cloud API format translation, webhook HMAC validation | Messaging, Webhook Gateway | Meta WhatsApp API |
| `conversations` | Thread aggregation, agent assignment, human takeover, Socket.IO broadcast | Webhook Gateway, Messaging, AI Engine | SocketServer, MongoDB |
| `workflow` | DAG definition, step execution, condition evaluation, state transitions | Campaigns, Webhook Gateway, Worker | Contacts, Messaging, AI, Integrations, MongoDB, Redis |
| `ai-agent` | Prompt construction, intent detection, knowledge retrieval, tool execution | Workflow, Worker | Knowledge Base, Integrations, LLM Providers |
| `knowledge-base` | FAQ storage, policy articles, retrieval indexing | AI Agent, API Gateway | MongoDB |
| `integrations` | Microsoft Graph API client, Excel Online reader, local mock fixture loader | Workflow, AI Agent | Microsoft Graph API, MongoDB |
| `analytics` | Metrics aggregation, funnel statistics, export generation | API Gateway | MongoDB |
| `audit` | Administrative event logging, payload diffing | All Modules | MongoDB |

## Runtime processes

### 1. API server process (`server.js`)
- Exposes RESTful endpoints on port `5000`.
- Terminates TLS or runs behind a reverse proxy.
- Hosts the Socket.IO server on the same HTTP listener.
- Handles synchronous user interactions: authentication, contact uploads, manual messaging, campaign definitions.
- Receives inbound WhatsApp webhooks, validates signatures, stores raw event payloads, and immediately pushes jobs to BullMQ queues (`HTTP 200 OK` returned within 50ms).

### 2. Worker process (`worker.js`)
- Runs as an independent Node.js process executing BullMQ queue consumers.
- Manages concurrency, rate limits, delays, and retries.
- Consumes from 4 primary queues:
  - `message-dispatch`: Controls outbound message pacing (e.g. 20 messages/second) to satisfy WhatsApp rate limits.
  - `workflow-execution`: Advances execution steps for contacts, evaluates conditions, and runs actions.
  - `integration-sync`: Executes external network requests against Microsoft Graph API.
  - `ai-tasks`: Handles LLM generation calls asynchronously without tying up API HTTP threads.

## Real-time communication layer

Socket.IO enables real-time synchronization between the backend and browser clients.

### Connection handling
- Authenticated via JWT token passed in the `auth.token` handshake parameter.
- Connections without a valid JWT are rejected immediately.

### Room structure
- `user:<userId>`: Personal notifications, direct mentions, task completions.
- `conversation:<conversationId>`: Active chat updates, typing indicators, read receipts.
- `inbox:team`: Global inbox updates for agents (new incoming messages, escalation alerts, unassigned counts).
- `campaign:<campaignId>`: Live progress counters (sent, delivered, failed, response rates).

### Core real-time events

| Event name | Direction | Payload contents | Target room |
|---|---|---|---|
| `message:received` | Server -> Client | Message entity, conversation summary | `conversation:<id>`, `inbox:team` |
| `message:status_updated` | Server -> Client | Message ID, status (`sent`, `delivered`, `read`, `failed`) | `conversation:<id>` |
| `conversation:assigned` | Server -> Client | Conversation ID, assigned user object | `inbox:team`, `user:<id>` |
| `conversation:escalated` | Server -> Client | Conversation ID, reason, contact info | `inbox:team` |
| `campaign:progress` | Server -> Client | Campaign ID, stats counter snapshot | `campaign:<id>` |

## Data flow diagrams

### Outbound campaign dispatch flow

```mermaid
sequenceDiagram
    autonumber
    actor User as HR User
    participant API as API Server
    participant DB as MongoDB
    participant Queue as Redis (BullMQ)
    participant Worker as Background Worker
    participant Provider as Messaging Provider

    User->>API: POST /api/v1/campaigns/{id}/launch
    API->>DB: Update campaign status to "running"
    API->>DB: Query enrolled contacts from list
    loop For each contact (100 - 500 rows)
        API->>DB: Create WorkflowExecution record (status: "running")
        API->>Queue: Push job to "workflow-execution" (contactId, stepId: "step_01")
    end
    API-->>User: Return 200 Accepted (Campaign started)
    Worker->>Queue: Pull job from "workflow-execution"
    Worker->>DB: Fetch Step definition (send_message)
    Worker->>Queue: Push job to "message-dispatch"
    Worker->>Provider: Send WhatsApp template / text
    Provider-->>Worker: Return providerMessageId
    Worker->>DB: Update message status to "sent" & transition step
```

### Inbound webhook and workflow progression

```mermaid
sequenceDiagram
    autonumber
    participant Provider as WhatsApp Provider (Mock / Meta)
    participant Webhook as Webhook Controller
    participant DB as MongoDB
    participant Queue as Redis (BullMQ)
    participant Worker as Background Worker
    participant Sockets as Socket.IO Server

    Provider->>Webhook: POST /api/v1/webhooks/whatsapp
    Webhook->>Webhook: Verify signature / provider origin
    Webhook->>DB: Upsert Message record (direction: "inbound")
    Webhook->>Queue: Push job to "workflow-execution" (event: "message_received")
    Webhook-->>Provider: HTTP 200 OK
    Webhook->>Sockets: Emit "message:received" to team inbox
    Worker->>Queue: Pull job
    Worker->>DB: Find active WorkflowExecution for contact
    alt Current step is "wait_for_reply"
        Worker->>Worker: Match reply against branches (e.g., YES vs NO)
        Worker->>DB: Save branch result, advance currentStepId
        Worker->>Queue: Push next step execution
    else Current step is "ai_conversation"
        Worker->>Queue: Push job to "ai-tasks" for automated answer
    end
```

## Deployment topology

```mermaid
graph LR
    subgraph ReverseProxy ["Edge / Proxy"]
        Nginx["Nginx / Cloudflare"]
    end

    subgraph AppServers ["Container Cluster / VM"]
        APIServer["API Container (Node.js)"]
        WorkerService["Worker Container (Node.js)"]
    end

    subgraph DataServices ["Managed Data Layer"]
        Atlas[("MongoDB Atlas 7.0+")]
        RedisCloud[("Redis 7.0+ (Cluster/Standalone)")]
    end

    Nginx -->|/api and /socket.io| APIServer
    APIServer --> Atlas
    APIServer --> RedisCloud
    WorkerService --> Atlas
    WorkerService --> RedisCloud
```

### Process isolation rules
1. API instances never execute long-running loops, document parsing jobs, or synchronous LLM requests.
2. Worker instances never bind to public HTTP ports.
3. Node process crashes in workers do not impact API responsiveness.
4. Scale workers horizontally by adding container instances listening to the same BullMQ Redis queues.

