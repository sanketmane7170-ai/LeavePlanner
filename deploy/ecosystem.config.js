// PM2 process config for the Leave Planner (project #2).
// Both processes bind to 127.0.0.1 only — nginx is the single public entrypoint.
// Ports 4001/4003 are chosen to avoid colliding with a typical first project on 3000/3001.
// The setup script verifies they are free before first start.

module.exports = {
  apps: [
    {
      name: 'leave-backend',
      cwd: '/var/www/leave-planner/backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '4001',
        HOST: '127.0.0.1',
      },
      max_memory_restart: '400M',
      error_file: '/var/log/leave-planner/backend-error.log',
      out_file: '/var/log/leave-planner/backend-out.log',
      time: true,
    },
    {
      name: 'leave-frontend',
      cwd: '/var/www/leave-planner/frontend',
      // Bind Next.js to localhost:4003 only
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 4003',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '4003',
      },
      max_memory_restart: '500M',
      error_file: '/var/log/leave-planner/frontend-error.log',
      out_file: '/var/log/leave-planner/frontend-out.log',
      time: true,
    },
  ],
};
