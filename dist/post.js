// This file is generated from src/post.js. Do not edit directly.
"use strict";

const fs = require("node:fs");

function inputState(name, fallback = "") {
  const key = `STATE_${name.toUpperCase()}`;
  const value = process.env[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value;
}

function toBool(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "") {
    return fallback;
  }
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function escapeCommand(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

function info(message) {
  console.log(`[gripmock-action] ${message}`);
}

function warning(message) {
  console.log(`::warning::${escapeCommand(message)}`);
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_err) {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopProcess(pid) {
  if (!processAlive(pid)) {
    return;
  }

  if (process.platform === "win32") {
    process.kill(pid, "SIGTERM");
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch (_err) {
    process.kill(pid, "SIGTERM");
  }

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) {
      return;
    }
    await sleep(250);
  }

  try {
    if (process.platform === "win32") {
      process.kill(pid, "SIGKILL");
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch (_err) {
    // ignore
  }
}

async function run() {
  const autoStop = toBool(inputState("auto_stop", "true"), true);
  if (!autoStop) {
    info("auto-stop=false, skipping shutdown");
    return;
  }

  const pidRaw = inputState("pid", "").trim();
  if (!pidRaw) {
    info("No pid in state, nothing to stop");
    return;
  }

  const pid = Number(pidRaw);
  if (!Number.isInteger(pid) || pid <= 0) {
    warning(`Invalid pid in state: ${pidRaw}`);
    return;
  }

  await stopProcess(pid);
  info(`Stopped GripMock process ${pid}`);

  const logFile = inputState("log_file", "").trim();
  if (logFile && fs.existsSync(logFile)) {
    info(`GripMock log file: ${logFile}`);
  }
}

run().catch((err) => {
  const message = err && err.stack ? err.stack : String(err);
  warning(`Post step failed: ${message}`);
});
