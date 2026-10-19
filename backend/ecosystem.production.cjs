module.exports = {
  apps: [
    {
      name: 'peerprep-backend',
      script: 'src/server.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1400M',
      kill_timeout: 45000,
      listen_timeout: 15000,
      env: {
        NODE_ENV: 'production',
        START_EXECUTION_WORKERS: 'false',
        START_SCHEDULED_JOBS: 'false',
        // Keep platform email delivery attached to the always-on API process.
        // MailJob claims are atomic, so the maintenance worker can safely run
        // alongside this consumer without sending a job twice.
        START_MAIL_WORKER: 'true',
      },
    },
    {
      name: 'peerprep-compiler-worker',
      script: 'src/workers/compiler.worker.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      kill_timeout: 45000,
      max_memory_restart: '900M',
      env: {
        NODE_ENV: 'production',
        COMPILER_WORKER_CONCURRENCY: '2',
      },
    },
    {
      name: 'peerprep-assessment-worker',
      script: 'src/workers/assessment.worker.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      kill_timeout: 45000,
      max_memory_restart: '900M',
      env: {
        NODE_ENV: 'production',
        ASSESSMENT_WORKER_CONCURRENCY: '2',
      },
    },
    {
      name: 'peerprep-maintenance-worker',
      script: 'src/workers/maintenance.worker.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      kill_timeout: 45000,
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
