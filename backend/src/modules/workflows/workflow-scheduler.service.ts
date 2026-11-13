import { Queue, Worker, Job } from 'bullmq';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { WorkflowExecution } from '../../models/workflow-execution.model.js';

let delayQueue: Queue | null = null;
let delayWorker: Worker | null = null;
let sweeperInterval: NodeJS.Timeout | null = null;

function getQueueConnection() {
  const redisUrl = new URL(env.REDIS_URL || 'redis://localhost:6379');
  return {
    host: redisUrl.hostname || '127.0.0.1',
    port: parseInt(redisUrl.port || '6379', 10),
    password: redisUrl.password || undefined,
    maxRetriesPerRequest: null
  };
}

export class WorkflowSchedulerService {
  private static isInitialized = false;

  public static async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const connection = getQueueConnection();
      delayQueue = new Queue('workflow-delays', { connection });

      delayWorker = new Worker(
        'workflow-delays',
        async (job: Job) => {
          const { executionId, stepId } = job.data;
          logger.info('BullMQ worker processing scheduled workflow delay job', {
            jobId: job.id,
            executionId,
            stepId
          });

          const { WorkflowEngine } = await import('./workflow.engine.js');
          await WorkflowEngine.executeDelayedStep(executionId, stepId);
        },
        {
          connection,
          concurrency: 5
        }
      );

      delayWorker.on('failed', (job, err) => {
        logger.error('Scheduled workflow delay job failed', {
          jobId: job?.id,
          error: err.message
        });
      });

      await delayWorker.waitUntilReady();
      await delayQueue.waitUntilReady();

      // Periodic MongoDB Sweeper: runs every 30 seconds as dual-resilience fallback
      // Catches any delayed executions that became due during server restarts
      sweeperInterval = setInterval(async () => {
        try {
          const overdue = await WorkflowExecution.find({
            status: 'delayed',
            delayUntil: { $lte: new Date() }
          }).limit(20);

          if (overdue.length > 0) {
            logger.info('Database sweeper found overdue delayed executions, processing...', {
              count: overdue.length
            });
            const { WorkflowEngine } = await import('./workflow.engine.js');
            for (const exec of overdue) {
              await WorkflowEngine.executeDelayedStep(exec._id.toString(), exec.currentStepId);
            }
          }
        } catch (sweepErr: any) {
          logger.warn('Workflow delay sweeper encountered an issue', { error: sweepErr.message });
        }
      }, 30000);

      this.isInitialized = true;
      logger.info('WorkflowSchedulerService initialized (BullMQ Queue + Redis Worker + Fallback Sweeper active)');
    } catch (err: any) {
      logger.warn('Failed to initialize BullMQ for WorkflowSchedulerService, fallback sweeper only', {
        error: err.message
      });

      // Still run the database sweeper even if Redis is unavailable
      if (!sweeperInterval) {
        sweeperInterval = setInterval(async () => {
          try {
            const overdue = await WorkflowExecution.find({
              status: 'delayed',
              delayUntil: { $lte: new Date() }
            }).limit(20);

            if (overdue.length > 0) {
              const { WorkflowEngine } = await import('./workflow.engine.js');
              for (const exec of overdue) {
                await WorkflowEngine.executeDelayedStep(exec._id.toString(), exec.currentStepId);
              }
            }
          } catch {}
        }, 30000);
      }
    }
  }

  public static async scheduleDelay(
    executionId: string,
    stepId: string,
    delayMs: number
  ): Promise<void> {
    const jobId = `delay_${executionId}_${stepId}`;
    if (delayQueue) {
      try {
        await delayQueue.add(
          'execute-delayed-step',
          { executionId, stepId },
          {
            delay: Math.max(500, delayMs),
            jobId,
            removeOnComplete: true,
            removeOnFail: 100
          }
        );
        logger.info('Scheduled workflow delay via BullMQ', { jobId, delayMs, executionId, stepId });
        return;
      } catch (err: any) {
        logger.warn('Failed to add job to BullMQ queue, relying on MongoDB sweeper', { error: err.message });
      }
    }
  }

  public static async cancelDelay(executionId: string): Promise<void> {
    if (delayQueue) {
      try {
        // Find and remove matching job if in delayed state
        const delayedJobs = await delayQueue.getDelayed();
        for (const job of delayedJobs) {
          if (job.data?.executionId === executionId) {
            await job.remove();
            logger.info('Cancelled pending BullMQ delay job on contact reply', {
              jobId: job.id,
              executionId
            });
          }
        }
      } catch (err: any) {
        logger.warn('Failed to cancel BullMQ delay job cleanly', { error: err.message });
      }
    }
  }

  public static async close(): Promise<void> {
    if (sweeperInterval) {
      clearInterval(sweeperInterval);
      sweeperInterval = null;
    }
    if (delayWorker) {
      await delayWorker.close();
      delayWorker = null;
    }
    if (delayQueue) {
      await delayQueue.close();
      delayQueue = null;
    }
    this.isInitialized = false;
    logger.info('WorkflowSchedulerService shut down');
  }
}
