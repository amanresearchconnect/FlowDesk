# FlowDesk: Internal WhatsApp Automation Platform

FlowDesk is an internal WhatsApp automation and communication platform built for company workflows. It provides spreadsheet contact ingestion, automated campaign dispatch, multi-step interactive workflow orchestration, AI-driven candidate inquiries, and a shared team inbox with real-time human takeover.

The initial use case is candidate recruitment and survey verification, backed by a modular engine designed to support general business workflows (onboarding, event check-ins, internal feedback).

## Architecture overview

FlowDesk deploys as a modular monolith:
- **Frontend**: React 19, Vite, Tailwind CSS v4, React Router, Zustand, TanStack Table, Socket.IO Client.
- **Backend API**: Node.js, Express, MongoDB (Mongoose), Socket.IO, Zod validation.
- **Background Processing**: Redis, BullMQ queue workers.
- **Messaging**: Provider-agnostic abstraction (`IMessagingProvider`) with full `MockWhatsAppProvider` for local testing without Meta credentials.
- **AI Agent**: Provider-agnostic assistant (`IAIProvider`) with `MockAIProvider` and `GeminiAIProvider`, using deterministic tool execution sandboxes.
- **External Integrations**: Microsoft Graph API for Excel Online worksheet verification, with a local fixture fallback mode.

```
FlowDesk/
├── docs/                             # Complete technical specifications
│   ├── 01-PRODUCT-REQUIREMENTS.md    # Product scope and requirements
│   ├── 02-SYSTEM-ARCHITECTURE.md     # Architecture topology and data flows
│   ├── 03-DATABASE-SCHEMA.md         # Mongoose models and indexes
│   ├── 04-WORKFLOW-ENGINE.md         # DAG state machine and step specifications
│   ├── 05-AI-AGENT-ARCHITECTURE.md   # AI assistant, tools, and guardrails
│   ├── 06-MESSAGING-ARCHITECTURE.md  # Provider abstraction and mock WhatsApp
│   ├── 07-API-SPECIFICATION.md       # REST contracts and JSON schemas
│   ├── 08-SECURITY-AND-PERMISSIONS.md# RBAC, JWT, and webhook security
│   ├── 09-DEVELOPMENT-ROADMAP.md     # Phase-based implementation roadmap
│   └── 10-TESTING-STRATEGY.md        # Vitest, Supertest, and fixture strategy
├── .agent/rules/project-rules.md     # Engineering rules and coding standards
├── .env.example                      # Configuration reference
└── README.md                         # Project overview
```

## Core capabilities

1. **Spreadsheet ingestion and normalization**: Upload CSV or Excel files (100 to 500 rows), map columns interactively, normalize phone numbers to E.164, and skip duplicates automatically.
2. **Deterministic workflow engine**: Build directed execution graphs with actions (`send_message`, `wait_for_reply`, `condition`, `delay`, `verify_data`, `update_record`, `terminate`).
3. **Mock WhatsApp environment**: Test end-to-end messaging and simulate incoming candidate replies (`YES` / `NO` / survey codes) without a WhatsApp Business Account.
4. **AI assistant with tool guardrails**: Provide automated conversational responses from approved knowledge base articles. The LLM has zero direct database access and interacts solely through validated backend tools.
5. **Team inbox with real-time handoff**: Shared interface with live message sync, unread counters, agent assignment, and one-click takeover via Socket.IO.
6. **Excel Online survey verification**: Query Microsoft 365 Excel Online spreadsheets via Graph API to verify candidate survey completion.

## Documentation index

- [Product requirements](docs/01-PRODUCT-REQUIREMENTS.md)
- [System architecture](docs/02-SYSTEM-ARCHITECTURE.md)
- [Database schema](docs/03-DATABASE-SCHEMA.md)
- [Workflow engine](docs/04-WORKFLOW-ENGINE.md)
- [AI agent architecture](docs/05-AI-AGENT-ARCHITECTURE.md)
- [Messaging architecture](docs/06-MESSAGING-ARCHITECTURE.md)
- [API specification](docs/07-API-SPECIFICATION.md)
- [Security and permissions](docs/08-SECURITY-AND-PERMISSIONS.md)
- [Development roadmap](docs/09-DEVELOPMENT-ROADMAP.md)
- [Testing strategy](docs/10-TESTING-STRATEGY.md)

## Development requirements

- Node.js 20 LTS or higher
- Docker and Docker Compose (for local MongoDB and Redis)
- npm 10 or higher

