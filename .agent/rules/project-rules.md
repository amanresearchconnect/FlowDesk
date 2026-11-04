# FlowDesk engineering and development rules

These rules bind all software development within the FlowDesk codebase.

## 1. Modular architecture and separation of concerns

- Maintain strict directory separation across layers:
  - `controllers/`: HTTP/WebSocket request handling, parameter extraction, and status code responses. Never execute direct database queries or external API calls inside a controller.
  - `services/`: Business logic, workflow orchestration, database updates, and external service interactions.
  - `models/`: Mongoose schemas, types, validation rules, and indexes.
  - `routes/`: Route declarations pairing HTTP verbs and paths with validation middleware and controllers.
  - `validators/`: Zod schemas validating request parameters, query strings, and body payloads.
  - `providers/`: Adapters conforming to domain interfaces (`IMessagingProvider`, `IAIProvider`).

## 2. Abstractions and decoupling

- **Messaging independence**: Never import WhatsApp provider SDKs or construct Meta-specific payloads outside `providers/whatsapp/`. Core services interact exclusively with the `IMessagingProvider` interface.
- **Workflow generality**: Never hardcode recruitment-specific terminology or logic into the workflow engine. Workflows execute generic step types (`send_message`, `wait_for_reply`, `condition`, `delay`, `verify_data`, `update_record`, `terminate`).
- **AI sandbox boundaries**:
  - The AI agent never receives direct database connections or credentials.
  - The AI agent never executes database writes directly.
  - The AI agent only proposes tool calls. The backend intercepts, validates arguments with Zod, checks execution permissions, and invokes deterministic service functions.

## 3. Input validation and error handling

- Every API endpoint must have a Zod schema validating `body`, `query`, and `params`.
- Reject invalid requests with HTTP 400/422 and a structured error envelope before invoking services.
- Never write bare `try/catch` blocks that swallow errors silently.
- Throw typed domain errors (e.g. `NotFoundError`, `ValidationError`, `ConflictError`, `IntegrationError`).
- The centralized Express error handler converts domain errors into consistent JSON responses.

## 4. State transitions and idempotency

- Workflow executions must enforce atomic status transitions using Mongoose `findOneAndUpdate` with expected precondition states (e.g. `status: 'waiting_for_reply'`).
- Inbound webhook processing and BullMQ jobs must assign deterministic idempotency keys (`jobId: wf:{executionId}:{stepId}:{attempt}`) to prevent duplicate step runs upon network retries.

## 5. Security and credentials

- Never commit secrets, tokens, passwords, or credentials into version control.
- Read all configuration from environment variables via a validated config module.
- Validate webhook signatures using constant-time HMAC comparison before processing.
- Hash passwords with bcrypt (work factor 12).
- Sanitize database queries to prevent injection attacks.

## 6. Testing and completion standards

- Never declare a feature complete without automated tests.
- Unit test pure business logic (phone normalization, column mapping, condition evaluations, tool schema validators).
- Integration test HTTP endpoints using Supertest and an in-memory database.
- Test workflows end-to-end using `MockWhatsAppProvider` and `MockAIProvider`.
- When modifying existing code, first inspect related files and tests to avoid breaking existing contracts.


## 7. Version control and commit policy

- **Explicit user approval required for commits**: Never execute `git commit` or `git push` directly without first presenting the proposed changes, explaining what will be committed, and asking for explicit user approval.
- **Git author identity**: All commits must be attributed strictly to `amanresearchconnect <amanresearchconnect@users.noreply.github.com>`.
