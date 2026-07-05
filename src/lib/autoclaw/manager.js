const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");

const AUTOCLAW_DIR = path.resolve(process.cwd(), "autoclaw");
const TOKENS_FILE = path.join(AUTOCLAW_DIR, "tokens.json");
const PROXY_PORT = 31000;

let proc = null;
let ready = false;
let error = null;

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "127.0.0.1");
  });
}

function findPython() {
  const candidates = [
    "python3", "python",
    process.platform === "win32" ? "py" : null,
  ].filter(Boolean);
  for (const cmd of candidates) {
    try {
      require("child_process").execSync(`${cmd} --version`, { stdio: "ignore" });
      return cmd;
    } catch {}
  }
  return null;
}

function findPip(pythonCmd) {
  const candidates = [
    `${pythonCmd} -m pip`,
    `pip3`, `pip`,
  ];
  for (const cmd of candidates) {
    try {
      require("child_process").execSync(`${cmd} --version`, { stdio: "ignore" });
      return cmd;
    } catch {}
  }
  return null;
}

async function ensureDeps(pythonCmd) {
  const reqFile = path.join(AUTOCLAW_DIR, "requirements.txt");
  if (!fs.existsSync(reqFile)) return true;
  const pip = findPip(pythonCmd);
  if (!pip) {
    error = "pip not found. Install Python dependencies manually: cd autoclaw && pip install -r requirements.txt";
    return false;
  }
  return true;
}

async function start() {
  if (proc) return { running: true, port: PROXY_PORT };

  const python = findPython();
  if (!python) {
    error = "Python not found. Install Python 3.10+ to use AutoClaw automation.";
    return { running: false, error };
  }

  const inUse = await isPortInUse(PROXY_PORT);
  if (inUse) {
    ready = true;
    error = null;
    return { running: true, port: PROXY_PORT, note: "already in use" };
  }

  await ensureDeps(python);

  const proxyScript = path.join(AUTOCLAW_DIR, "proxy.py");
  if (!fs.existsSync(proxyScript)) {
    error = `proxy.py not found at ${proxyScript}`;
    return { running: false, error };
  }

  if (!fs.existsSync(TOKENS_FILE)) {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({ accounts: [] }, null, 2));
  }

  const env = {
    ...process.env,
    PYTHONUNBUFFERED: "1",
  };

  proc = spawn(python, [proxyScript], {
    cwd: AUTOCLAW_DIR,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stdout.on("data", (data) => {
    const text = data.toString();
    if (text.includes("* Running on")) {
      ready = true;
      error = null;
    }
  });

  proc.stderr.on("data", (data) => {
    const text = data.toString();
    if (text.includes("* Running on")) {
      ready = true;
      error = null;
    }
  });

  proc.on("close", (code) => {
    ready = false;
    proc = null;
    if (code !== 0 && !error) {
      error = `AutoClaw proxy exited with code ${code}`;
    }
  });

  proc.on("error", (err) => {
    ready = false;
    error = err.message;
    proc = null;
  });

  return { running: true, port: PROXY_PORT };
}

function stop() {
  if (!proc) return { running: false };
  proc.kill("SIGTERM");
  setTimeout(() => {
    if (proc) proc.kill("SIGKILL");
  }, 5000);
  proc = null;
  ready = false;
  return { running: false };
}

function getStatus() {
  return {
    running: !!proc,
    ready,
    port: PROXY_PORT,
    error,
    python: findPython(),
    autoclawDir: AUTOCLAW_DIR,
    tokensExist: fs.existsSync(TOKENS_FILE),
  };
}

module.exports = { start, stop, getStatus, AUTOCLAW_DIR, TOKENS_FILE, PROXY_PORT };
