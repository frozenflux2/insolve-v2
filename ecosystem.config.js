module.exports = {
  apps: [
    {
      name: 'TF2Double',
      script: './index.js',
      env: {
        "NODE_ENV": "production",
      },
      error_file: "/home/tf2double/.logs/error.log",
      out_file: "/home/tf2double/.logs/output.log",
      log_file: "/home/tf2double/.logs/combined.log",
    }
  ]
}