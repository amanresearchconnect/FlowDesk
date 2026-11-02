# API specification

## Global conventions

- Base URL: `/api/v1`
- Protocol: HTTPS
- Content Type: `application/json` (except file uploads using `multipart/form-data`)
- Authentication: `Authorization: Bearer <access_token>`

### Standard success response
```json
{
  "success": true,
  "data": {},
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 120
  }
}
```

### Standard error response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "details": [
      {
        "field": "phone",
        "issue": "Must be a valid E.164 phone number"
      }
    ]
  }
}
```

## Authentication endpoints

### `POST /api/v1/auth/login`
Authenticates a user and issues access/refresh tokens.
- **Access**: Public
- **Request Body**:
  ```json
  {
    "email": "operator@company.com",
    "password": "SecretPassword123!"
  }
  ```
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "6732f91a0c41b8001f30e101",
        "name": "Sarah Connor",
        "email": "operator@company.com",
        "role": "manager"
      },
      "accessToken": "eyJhbGciOiJIUzI1Ni...",
      "refreshToken": "eyJhbGciOiJIUzI1Ni..."
    }
  }
  ```

### `POST /api/v1/auth/refresh`
Issues a new access token using a valid refresh token.
- **Access**: Public

### `GET /api/v1/auth/me`
Retrieves authenticated user profile.
- **Access**: Authenticated

---

## Contact and import endpoints

### `POST /api/v1/contacts/upload-preview`
Uploads a spreadsheet file (`.csv`, `.xlsx`, `.xls`) and returns column headers and first 5 parsed preview rows.
- **Access**: Authenticated (`admin`, `manager`)
- **Content-Type**: `multipart/form-data` (file field: `file`)
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "data": {
      "fileToken": "tmp_file_a8910b7f8c",
      "totalRows": 250,
      "detectedHeaders": ["Candidate Name", "Mobile Phone", "Email", "Job Title", "Survey Code"],
      "sampleRows": [
        {
          "Candidate Name": "John Doe",
          "Mobile Phone": "9876543210",
          "Email": "john@example.com",
          "Job Title": "Quality Engineer",
          "Survey Code": "SURV-101"
        }
      ]
    }
  }
  ```

### `POST /api/v1/contacts/import`
Processes the uploaded file using user-defined column mappings, validates phone numbers, and inserts contacts.
- **Access**: Authenticated (`admin`, `manager`)
- **Request Body**:
  ```json
  {
    "fileToken": "tmp_file_a8910b7f8c",
    "listName": "Q4 Engineering Recruitment",
    "countryCode": "+91",
    "mappings": {
      "phone": "Mobile Phone",
      "firstName": "Candidate Name",
      "email": "Email",
      "customFields": {
        "jobTitle": "Job Title",
        "surveyCode": "Survey Code"
      }
    }
  }
  ```
- **Response 201 Created**:
  ```json
  {
    "success": true,
    "data": {
      "contactListId": "6732f91a0c41b8001f30e205",
      "totalImported": 248,
      "duplicatesSkipped": 2,
      "invalidRows": []
    }
  }
  ```

### `GET /api/v1/contacts`
Lists contacts with pagination, tag filters, and search.
- **Access**: Authenticated

---

## Campaign endpoints

### `POST /api/v1/campaigns`
Creates a new campaign.
- **Access**: Authenticated (`admin`, `manager`)
- **Request Body**:
  ```json
  {
    "name": "Software Engineer Batch A",
    "workflowId": "6732f91a0c41b8001f30e300",
    "contactListId": "6732f91a0c41b8001f30e205",
    "throttleRatePerSecond": 20
  }
  ```

### `POST /api/v1/campaigns/:id/launch`
Launches a campaign. Transitions status to `running` and schedules executions in BullMQ.
- **Access**: Authenticated (`admin`, `manager`)
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "data": {
      "campaignId": "6732f91a0c41b8001f30e401",
      "status": "running",
      "enrolledContacts": 248
    }
  }
  ```

### `GET /api/v1/campaigns/:id/stats`
Returns live metrics for a campaign.
- **Access**: Authenticated
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "data": {
      "totalContacts": 248,
      "dispatched": 248,
      "delivered": 242,
      "read": 210,
      "replied": 185,
      "converted": 140,
      "failed": 6
    }
  }
  ```

---

## Workflow endpoints

### `POST /api/v1/workflows`
Creates a new workflow definition.
- **Access**: Authenticated (`admin`, `manager`)
- **Request Body**: JSON definition matching `IWorkflow` schema.

### `POST /api/v1/workflows/:id/publish`
Publishes and freezes a workflow version for campaign execution.
- **Access**: Authenticated (`admin`, `manager`)

### `GET /api/v1/workflows/:id/executions`
Lists individual execution states for contacts enrolled in a workflow.
- **Access**: Authenticated

---

## Conversation and team inbox endpoints

### `GET /api/v1/conversations`
Lists conversations sorted by `lastMessageAt` descending with status filters (`bot`, `human_needed`, `agent_assigned`, `closed`).
- **Access**: Authenticated

### `GET /api/v1/conversations/:id/messages`
Retrieves chronological message history for a conversation.
- **Access**: Authenticated

### `POST /api/v1/conversations/:id/messages`
Sends a manual outgoing message from an agent to the candidate.
- **Access**: Authenticated
- **Request Body**:
  ```json
  {
    "body": "Hello John, this is Sarah from HR. I see you had a question regarding the survey deadline."
  }
  ```

### `POST /api/v1/conversations/:id/takeover`
Assigns the conversation to the requesting agent and updates status to `agent_assigned`.
- **Access**: Authenticated

### `POST /api/v1/conversations/:id/release-to-bot`
Releases an agent-assigned conversation back to automated bot handling.
- **Access**: Authenticated

---

## External integrations endpoints

### `GET /api/v1/integrations/microsoft-graph/status`
Returns configuration and token validity for Microsoft Graph API.
- **Access**: Authenticated (`admin`)

### `POST /api/v1/integrations/microsoft-graph/test-connection`
Queries the configured Excel Online workbook to verify worksheet readability.
- **Access**: Authenticated (`admin`)
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "data": {
      "connected": true,
      "workbookName": "Recruitment_Surveys_2026.xlsx",
      "worksheetName": "Responses",
      "totalRowsDetected": 1420
    }
  }
  ```

---

## Webhook endpoints

### `GET /api/v1/webhooks/whatsapp`
Meta WhatsApp Cloud API webhook verification handshake.
- **Query params**: `hub.mode`, `hub.verify_token`, `hub.challenge`

### `POST /api/v1/webhooks/whatsapp`
Receives inbound WhatsApp webhooks (incoming messages, status receipts).
- **Headers**: `X-Hub-Signature-256`
- **Response**: `HTTP 200 OK`

---

## Mock developer endpoints (available when `NODE_ENV !== 'production'`)

### `POST /api/v1/mock/whatsapp/incoming`
Simulates an incoming WhatsApp message from a candidate.
- **Request Body**:
  ```json
  {
    "fromPhone": "+15550001111",
    "text": "YES"
  }
  ```

### `POST /api/v1/mock/whatsapp/status`
Simulates a message delivery or read receipt.
- **Request Body**:
  ```json
  {
    "providerMessageId": "mock_msg_91a0b3",
    "status": "read"
  }
  ```

### `GET /api/v1/mock/whatsapp/outbound`
Lists recent outbound mock messages.

