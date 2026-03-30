// This file is generated from src/main.js. Do not edit directly.
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { spawn, spawnSync } = require("node:child_process");

const OWNER = "bavix";
const REPO = "gripmock";
const GITHUB_TOKEN_EXPR_RE = /^\$\{\{\s*github\.token\s*\}\}$/i;

function input(name, fallback = "") {
  const key = `INPUT_${name.replace(/ /g, "_").replace(/-/g, "_").toUpperCase()}`;
  const value = process.env[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value;
}

function boolInput(name, fallback) {
  const value = input(name, "").trim().toLowerCase();
  if (value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "y", "on"].includes(value);
}

function listInput(name) {
  return input(name, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseDurationMs(raw, label) {
  const value = String(raw || "").trim();
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/i);
  if (!match) {
    throw new Error(`Invalid ${label}: ${raw}`);
  }

  const n = Number(match[1]);
  const unit = (match[2] || "ms").toLowerCase();

  const multiplier = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
  }[unit];

  return Math.max(1, Math.floor(n * multiplier));
}

function log(message) {
  console.log(`[gripmock-action] ${message}`);
}

function warn(message) {
  console.log(`::warning::${escapeCommand(message)}`);
}

function error(message) {
  console.log(`::error::${escapeCommand(message)}`);
}

function escapeCommand(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

function appendFileLine(file, line) {
  if (!file) {
    return;
  }
  fs.appendFileSync(file, `${line}\n`, { encoding: "utf8" });
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    return;
  }
  appendFileLine(outputFile, `${name}=${String(value)}`);
}

function saveState(name, value) {
  const stateFile = process.env.GITHUB_STATE;
  if (!stateFile) {
    return;
  }
  appendFileLine(stateFile, `${name}=${String(value)}`);
}

function addPath(dir) {
  const pathFile = process.env.GITHUB_PATH;
  if (!pathFile) {
    return;
  }
  appendFileLine(pathFile, dir);
}

function mapPlatform() {
  const p = process.platform;
  if (p === "linux") {
    return "linux";
  }
  if (p === "darwin") {
    return "darwin";
  }
  if (p === "win32") {
    return "windows";
  }
  throw new Error(`Unsupported platform: ${p}`);
}

function mapArch() {
  const a = process.arch;
  if (a === "x64") {
    return "amd64";
  }
  if (a === "arm64") {
    return "arm64";
  }
  throw new Error(`Unsupported architecture: ${a}`);
}

async function fetchJson(url, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "gripmock-action",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 400)}`);
  }
  return res.json();
}

async function resolveLatestTagViaRedirect() {
  const latestUrl = `https://github.com/${OWNER}/${REPO}/releases/latest`;
  const res = await fetch(latestUrl, {
    method: "GET",
    redirect: "manual",
    headers: { "User-Agent": "gripmock-action" },
  });

  const location = res.headers.get("location") || "";
  const match = location.match(/\/releases\/tag\/(v[^/?#]+)/i);
  if (!match) {
    return "";
  }

  return match[1].trim();
}

async function downloadFile(url, destination, token) {
  const headers = { "User-Agent": "gripmock-action" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok || !res.body) {
    const body = await res.text();
    throw new Error(`Failed downloading ${url}: HTTP ${res.status} ${body.slice(0, 300)}`);
  }

  await fs.promises.mkdir(path.dirname(destination), { recursive: true });

  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(destination);
    const body = Readable.fromWeb(res.body);
    body.on("error", reject);
    stream.on("error", reject);
    stream.on("finish", resolve);
    body.pipe(stream);
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function sanitizeVersion(version) {
  const v = String(version || "").trim();
  // Allow only alphanumerics, dot, underscore, and dash (e.g., "1.2.3", "1.2.3-beta_1").
  // This prevents path separators, spaces, and other potentially dangerous characters.
  if (!v || !/^[0-9A-Za-z._-]+$/.test(v)) {
    throw new Error(`Invalid version string: "${v}"`);
  }
  return v;
}

async function resolveVersion(versionInput, token) {
  const normalized = String(versionInput || "latest").trim();
  if (normalized === "" || normalized.toLowerCase() === "latest") {
    const redirectTag = await resolveLatestTagViaRedirect();
    if (redirectTag) {
      return redirectTag.replace(/^v/, "");
    }

    if (!token) {
      throw new Error(
        "Could not resolve latest version via redirect and no github-token provided. Pass a pinned version (recommended) or set github-token: ${{ github.token }}",
      );
    }

    warn("Could not resolve latest version via redirect, falling back to authenticated GitHub API");
    const release = await fetchJson(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, token);
    const tag = String(release.tag_name || "").trim();
    if (!tag) {
      throw new Error("Could not resolve latest release tag");
    }
    return sanitizeVersion(tag.replace(/^v/, ""));
  }
  return sanitizeVersion(normalized.replace(/^v/, ""));
}

function extractArchive(archivePath, destination) {
  fs.mkdirSync(destination, { recursive: true });

  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      throw new Error("Failed to extract archive with PowerShell");
    }
    return;
  }

  const result = spawnSync("tar", ["-xzf", archivePath, "-C", destination], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("Failed to extract archive with tar");
  }
}

function ensureExecutable(filePath) {
  if (process.platform === "win32") {
    return;
  }
  fs.chmodSync(filePath, 0o755);
}

function parseEnvLines(raw) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const env = {};
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx <= 0) {
      throw new Error(`Invalid env line: ${line}. Expected KEY=VALUE`);
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid env variable name: ${key}`);
    }
    env[key] = value;
  }

  return env;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_err) {
    return false;
  }
}

function readLogTail(logFile, lines = 120) {
  try {
    const text = fs.readFileSync(logFile, "utf8");
    const chunk = text.split(/\r?\n/).slice(-lines).join("\n");
    return chunk.trim();
  } catch (_err) {
    return "";
  }
}

async function waitReadiness({ url, timeoutMs, intervalMs, pid, logFile }) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (!processAlive(pid)) {
      const tail = readLogTail(logFile, 120);
      throw new Error(
        `GripMock process exited early (pid=${pid}).${tail ? `\n\nRecent logs:\n${tail}` : ""}`,
      );
    }

    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) {
        log(`GripMock is ready: ${url}`);
        return;
      }
    } catch (_err) {
      // keep waiting
    }

    await sleep(intervalMs);
  }

  const tail = readLogTail(logFile, 120);
  throw new Error(
    `Timed out waiting for GripMock readiness (${timeoutMs}ms): ${url}.${tail ? `\n\nRecent logs:\n${tail}` : ""}`,
  );
}

async function ensureProcessStability({ pid, logFile, stableMs }) {
  const start = Date.now();
  while (Date.now() - start < stableMs) {
    if (!processAlive(pid)) {
      const tail = readLogTail(logFile, 120);
      throw new Error(
        `GripMock exited shortly after readiness (pid=${pid}).${tail ? `\n\nRecent logs:\n${tail}` : ""}`,
      );
    }

    await sleep(200);
  }
}

function buildArgs({ source, sources, stub, imports, plugins, extraArgs }) {
  const args = [];

  if (stub) {
    args.push("--stub", stub);
  }

  for (const value of imports) {
    args.push("--imports", value);
  }

  for (const value of plugins) {
    args.push("--plugins", value);
  }

  for (const value of extraArgs) {
    args.push(value);
  }

  if (source) {
    args.push(source);
  }
  for (const value of sources) {
    args.push(value);
  }

  return args;
}

function resolveToken() {
  const rawInput = input("github-token", "").trim();
  if (rawInput && !GITHUB_TOKEN_EXPR_RE.test(rawInput)) {
    return rawInput;
  }

  const envToken = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (envToken) {
    return envToken;
  }

  if (rawInput && GITHUB_TOKEN_EXPR_RE.test(rawInput)) {
    warn("Input github-token looks like an unevaluated expression; pass with: github-token: ${{ github.token }}");
  }

  return "";
}

async function ensureBinary(version, token) {
  const platform = mapPlatform();
  const arch = mapArch();
  const ext = platform === "windows" ? ".zip" : ".tar.gz";
  const fileName = `gripmock_${version}_${platform}_${arch}${ext}`;

  const runnerTemp = process.env.RUNNER_TEMP || os.tmpdir();
  const installDir = path.join(runnerTemp, "gripmock-action", version, `${platform}-${arch}`);
  const binName = process.platform === "win32" ? "gripmock.exe" : "gripmock";
  const binPath = path.join(installDir, binName);

  if (fs.existsSync(binPath)) {
    ensureExecutable(binPath);
    return binPath;
  }

  await fs.promises.mkdir(installDir, { recursive: true });

  const archivePath = path.join(installDir, fileName);
  const extractDir = path.join(installDir, "extract");
  const downloadURL = `https://github.com/${OWNER}/${REPO}/releases/download/v${version}/${fileName}`;
  const checksumsURL = `https://github.com/${OWNER}/${REPO}/releases/download/v${version}/checksums.txt`;

  log(`Downloading ${downloadURL}`);
  await downloadFile(downloadURL, archivePath, token);

  const checksumsPath = path.join(installDir, "checksums.txt");
  await downloadFile(checksumsURL, checksumsPath, token);

  const checksumsRaw = fs.readFileSync(checksumsPath, "utf8");
  const checksumLine = checksumsRaw
    .split(/\r?\n/)
    .find((line) => line.trim().endsWith(fileName));

  if (!checksumLine) {
    throw new Error(`Checksum not found for ${fileName}`);
  }

  const expected = checksumLine.trim().split(/\s+/)[0];
  const actual = await sha256File(archivePath);
  if (expected !== actual) {
    throw new Error(`Checksum mismatch for ${fileName}`);
  }

  extractArchive(archivePath, extractDir);

  const extractedBinary = path.join(extractDir, binName);
  if (!fs.existsSync(extractedBinary)) {
    throw new Error(`Extracted binary not found: ${extractedBinary}`);
  }

  fs.copyFileSync(extractedBinary, binPath);
  ensureExecutable(binPath);

  return binPath;
}

async function run() {
  const versionInput = input("version", "latest");
  const token = resolveToken();

  const source = input("source", "").trim();
  const sources = listInput("sources");
  const stub = input("stub", "").trim();
  const imports = listInput("imports");
  const plugins = listInput("plugins");
  const extraArgs = listInput("extra-args");

  const grpcHost = input("grpc-host", "127.0.0.1").trim();
  const grpcPort = input("grpc-port", "4770").trim();
  const httpHost = input("http-host", "127.0.0.1").trim();
  const httpPort = input("http-port", "4771").trim();
  const logLevel = input("log-level", "info").trim();

  const waitEnabled = boolInput("wait", true);
  const waitTimeoutMs = parseDurationMs(input("wait-timeout", "30s"), "wait-timeout");
  const waitIntervalMs = parseDurationMs(input("wait-interval", "500ms"), "wait-interval");
  const autoStop = boolInput("auto-stop", true);

  const logFileInput = input("log-file", "").trim();
  const runnerTemp = process.env.RUNNER_TEMP || os.tmpdir();
  const logFile = logFileInput || path.join(runnerTemp, "gripmock.log");

  if (!source && sources.length === 0) {
    warn(
      "No source/sources were provided. GripMock will start without preloaded descriptors (use API runtime descriptor loading if intended).",
    );
  }

  const version = await resolveVersion(versionInput, token);
  log(`Using GripMock version ${version}`);

  const binPath = await ensureBinary(version, token);
  addPath(path.dirname(binPath));

  const args = buildArgs({ source, sources, stub, imports, plugins, extraArgs });
  log(`Starting: ${binPath} ${args.join(" ")}`);

  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const outFd = fs.openSync(logFile, "a");

  const extraEnv = parseEnvLines(input("env", ""));
  const childEnv = {
    ...process.env,
    ...extraEnv,
    LOG_LEVEL: logLevel,
    GRPC_HOST: grpcHost,
    GRPC_PORT: grpcPort,
    HTTP_HOST: httpHost,
    HTTP_PORT: httpPort,
  };

  const child = spawn(binPath, args, {
    detached: true,
    stdio: ["ignore", outFd, outFd],
    env: childEnv,
  });

  child.unref();
  fs.closeSync(outFd);

  const pid = child.pid;
  if (!pid) {
    throw new Error("Failed to start GripMock process");
  }

  const readinessUrl = `http://${httpHost}:${httpPort}/api/health/readiness`;

  saveState("pid", pid);
  saveState("auto_stop", String(autoStop));
  saveState("log_file", logFile);

  if (waitEnabled) {
    await waitReadiness({
      url: readinessUrl,
      timeoutMs: waitTimeoutMs,
      intervalMs: waitIntervalMs,
      pid,
      logFile,
    });

    await ensureProcessStability({
      pid,
      logFile,
      stableMs: Math.min(3000, waitTimeoutMs),
    });
  }

  setOutput("version", version);
  setOutput("binary-path", binPath);
  setOutput("pid", pid);
  setOutput("grpc-addr", `${grpcHost}:${grpcPort}`);
  setOutput("http-addr", `${httpHost}:${httpPort}`);
  setOutput("grpc-port", grpcPort);
  setOutput("http-port", httpPort);
  setOutput("readiness-url", readinessUrl);
  setOutput("log-file", logFile);

  log(`GripMock started (pid=${pid})`);
  log(`Logs: ${logFile}`);
}

run().catch((err) => {
  const message = err && err.stack ? err.stack : String(err);
  error(message);
  process.exitCode = 1;
});
