export type ConnectionOptions = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: object;
};

type Processor<T> = (job: { id: string; name: string; data: T }) => Promise<void>;

type QueueState = {
  jobs: Map<string, StoredJob<unknown>>;
  workers: Set<Processor<unknown>>;
};

type AddOptions = {
  jobId?: string;
  delay?: number;
  attempts?: number;
  backoff?: { type: string; delay: number };
  removeOnComplete?: unknown;
  removeOnFail?: unknown;
};

const queueRegistry = new Map<string, QueueState>();

function getQueueState<T>(name: string) {
  if (!queueRegistry.has(name)) {
    queueRegistry.set(name, {
      jobs: new Map<string, StoredJob<unknown>>(),
      workers: new Set<Processor<unknown>>(),
    });
  }
  return queueRegistry.get(name)!;
}

class StoredJob<T> {
  timeout: NodeJS.Timeout | null = null;
  attemptsMade = 0;

  constructor(
    readonly queueName: string,
    readonly id: string,
    readonly name: string,
    readonly data: T,
    readonly options: AddOptions
  ) {}

  arm() {
    const delay = Math.max(0, this.options.delay ?? 0);
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      void dispatchJob(this);
    }, delay);
  }
}

async function dispatchJob<T>(job: StoredJob<T>) {
  const state = getQueueState<T>(job.queueName);
  const worker = state.workers.values().next().value as Processor<T> | undefined;
  if (!worker) {
    job.arm();
    return;
  }

  try {
    await worker({ id: job.id, name: job.name, data: job.data });
    state.jobs.delete(job.id);
  } catch {
    job.attemptsMade += 1;
    if (job.attemptsMade >= (job.options.attempts ?? 1)) {
      state.jobs.delete(job.id);
      return;
    }
    job.options.delay = job.options.backoff?.delay ?? 0;
    job.arm();
  }
}

export class Queue<T> {
  constructor(readonly name: string, readonly _opts?: { connection?: ConnectionOptions; defaultJobOptions?: AddOptions }) {}

  async add(name: string, data: T, options?: AddOptions) {
    const state = getQueueState<T>(this.name);
    const jobId = options?.jobId ?? `${name}:${Date.now()}`;
    const merged = { ...this._opts?.defaultJobOptions, ...options };
    const job = new StoredJob(this.name, jobId, name, data, merged);
    state.jobs.set(jobId, job as StoredJob<unknown>);
    job.arm();
    return {
      id: jobId,
      name,
      data,
      remove: async () => {
        if (job.timeout) clearTimeout(job.timeout);
        state.jobs.delete(jobId);
      },
    };
  }

  async getJob(jobId: string) {
    const state = getQueueState<T>(this.name);
    const job = state.jobs.get(jobId) as StoredJob<T> | undefined;
    if (!job) return null;
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      remove: async () => {
        if (job.timeout) clearTimeout(job.timeout);
        state.jobs.delete(jobId);
      },
    };
  }
}

export class Worker<T> {
  private readonly processor: Processor<T>;

  constructor(
    readonly name: string,
    processor: Processor<T>,
    readonly _opts?: { connection?: ConnectionOptions }
  ) {
    this.processor = processor;
    const state = getQueueState<T>(name);
    state.workers.add(processor as Processor<unknown>);
  }

  async close() {
    const state = getQueueState<T>(this.name);
    state.workers.delete(this.processor as Processor<unknown>);
  }
}
