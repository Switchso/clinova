module.exports = {
  apps: [
    {
      name: "cms-suzan",
      script: "server/app.js",
      cwd: __dirname,
      instances: process.env.WEB_CONCURRENCY || 2,
      exec_mode: "cluster",
      watch: false,
      wait_ready: false,
      listen_timeout: 8000,
      kill_timeout: 5000,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production"
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
