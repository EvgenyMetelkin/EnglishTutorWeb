module.exports = {
  apps: [{
    name: "englishtutor",
    script: "server.js",
    cwd: "/var/www/englishtutor",
    env: {
      NODE_ENV: "production"
    },
    max_memory_restart: "300M",
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
};
