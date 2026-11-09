import mongoose from 'mongoose';

process.env.MESSAGING_PROVIDER = 'mock';
process.env.VERIFICATION_PROVIDER = 'mock';

import { WorkflowEngine } from '../modules/workflows/workflow.engine.js';
import { Contact } from '../models/contact.model.js';
import { Workflow } from '../models/workflow.model.js';
import { WorkflowExecution } from '../models/workflow-execution.model.js';

async function testSimulation() {
  await mongoose.connect('mongodb://localhost:27017/flowdesk');
  console.log('Connected to MongoDB');

  const wf = await Workflow.findById('6aeb3dfe22d4428257e7ce11');
  if (!wf) throw new Error('Workflow not found');
  console.log('Workflow loaded:', wf.name);

  // Find or create test contact
  let contact = await Contact.findOne({ phone: '+919999988888' });
  if (!contact) {
    contact = await Contact.create({
      firstName: 'Aman',
      lastName: 'Singh',
      phone: '+919999988888',
      email: 'aman@test.com',
      optInStatus: 'opted_in'
    });
  }

  // 1. Start execution
  console.log('\n--- Step 1: Starting Workflow ---');
  let exec = await WorkflowEngine.startExecution(
    wf._id.toString(),
    contact._id.toString(),
    undefined,
    contact.toObject()
  );
  console.log('Started step:', exec.currentStepId, 'status:', exec.status);

  // 2. Candidate replies YES to first question
  console.log('\n--- Step 2: Candidate replies YES ---');
  await WorkflowEngine.handleContactReply(contact._id, 'YES');
  exec = (await WorkflowExecution.findById(exec._id))!;
  console.log('After reply 1:', exec.currentStepId, 'status:', exec.status);

  // 3. Candidate replies YES to interest question
  console.log('\n--- Step 3: Candidate replies YES to interest ---');
  await WorkflowEngine.handleContactReply(contact._id, 'YES');
  exec = (await WorkflowExecution.findById(exec._id))!;
  console.log('After reply 2:', exec.currentStepId, 'status:', exec.status);

  // 4. Candidate replies YES, completed to survey link
  console.log('\n--- Step 4: Candidate replies YES, completed to survey ---');
  await WorkflowEngine.handleContactReply(contact._id, 'YES,completed');
  exec = (await WorkflowExecution.findById(exec._id))!;
  console.log('After reply 3:', exec.currentStepId, 'status:', exec.status);

  // 5. Check if it correctly paused at step_condition_details_wait!
  console.log('Paused waiting for survey details? Status should be waiting_for_reply:', exec.status);

  // 6. Candidate sends survey details!
  console.log('\n--- Step 5: Candidate sends survey details text ---');
  const detailsMessage = 'Aman Singh, aman@gmail.com, 9999988888, SURV-8821';
  await WorkflowEngine.handleContactReply(contact._id, detailsMessage);
  exec = (await WorkflowExecution.findById(exec._id))!;
  console.log('After sending details:', exec.currentStepId, 'status:', exec.status);

  // Check the step logs of append_to_sheet
  const appendLog = exec.stepLogs?.find(l => l.stepId === 'step_append_to_sheet_07qx');
  console.log('\nAppend to sheet log rowValues:', JSON.stringify(appendLog?.outputPayload || appendLog?.inputPayload, null, 2));

  await mongoose.disconnect();
}

testSimulation().catch(console.error);
