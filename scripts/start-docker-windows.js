import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename } from 'node:fs/promises';
import { delimiter, dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { prepareLocalEnvironment, projectRoot } from './setup-local.js';

export function isLocalDockerEndpoint(endpoint) {
  return (
    typeof endpoint === 'string' &&
    /^npipe:\/{2,}\.\/pipe\/[a-z\d_.-]+$/i.test(endpoint.replaceAll('\\', '/'))
  );
}

export function localOrigin(value, port) {
  const origin = new URL(value);
  if (
    origin.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(origin.hostname) ||
    origin.origin !== value ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('Set APP_ORIGIN to a local HTTP origin and PORT to a valid backend port.');
  }
  return origin;
}

export function dockerCommandEnvironment(env, docker, directories) {
  const cliDirectories = [
    ...new Set([dirname(docker), ...directories.map((path) => resolve(path, 'resources/bin'))]),
  ];
  return {
    ...env,
    PATH: [...cliDirectories, env.PATH || ''].filter(Boolean).join(delimiter),
  };
}

function run(file, args, { capture = false, timeout = 0, env = process.env } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(file, args, {
      cwd: projectRoot,
      windowsHide: true,
      env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let output = '';
    if (capture) {
      child.stdout.on('data', (data) => {
        output += data;
      });
      child.stderr.resume();
    }
    const timer = timeout ? setTimeout(() => child.kill(), timeout) : undefined;
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolveRun({ code, output });
    });
  });
}

async function firstExisting(paths) {
  for (const path of paths.filter(Boolean)) {
    try {
      await access(path);
      return path;
    } catch {}
  }
  return null;
}

function installDirectories() {
  return [
    process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA, 'Programs/DockerDesktop'),
    process.env.ProgramFiles && resolve(process.env.ProgramFiles, 'Docker/Docker'),
  ].filter(Boolean);
}

async function findDocker() {
  const common = await firstExisting(
    installDirectories().map((path) => resolve(path, 'resources/bin/docker.exe')),
  );
  if (common) return common;
  try {
    const result = await run('where.exe', ['docker.exe'], { capture: true, timeout: 5000 });
    return firstExisting(
      result.output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    );
  } catch {
    return null;
  }
}

async function installDocker(powershell) {
  const architecture =
    process.env.PROCESSOR_ARCHITEW6432 || process.env.PROCESSOR_ARCHITECTURE || '';
  if (!/^amd64$/i.test(architecture) && process.arch !== 'x64') {
    throw new Error(
      'Automatic installation targets x64 Windows. Install the matching Docker Desktop build from Docker.com first.',
    );
  }
  const cache = resolve(projectRoot, '.cache');
  await mkdir(cache, { recursive: true });
  const installer = resolve(cache, 'DockerDesktopInstaller.exe');
  console.log('Downloading the official Docker Desktop installer. This may take several minutes.');
  const response = await fetch(
    'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe',
    {
      signal: AbortSignal.timeout(20 * 60 * 1000),
    },
  );
  if (!response.ok || !response.body)
    throw new Error('Docker Desktop download failed. Check the Windows internet connection.');
  await pipeline(Readable.fromWeb(response.body), createWriteStream(installer + '.part'));
  await rename(installer + '.part', installer);
  console.log(
    'Verifying the installer signature and installing Docker Desktop for the current Windows user.',
  );
  const command = `
$ErrorActionPreference = 'Stop'
$signature = Get-AuthenticodeSignature -LiteralPath $env:SECURE_NOTES_DOCKER_INSTALLER
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Docker') {
    throw 'Docker installer signature verification failed.'
}
$installed = Start-Process -FilePath $env:SECURE_NOTES_DOCKER_INSTALLER -ArgumentList @('install', '--user', '--accept-license', '--quiet', '--backend=wsl-2') -Wait -PassThru
exit $installed.ExitCode
`;
  const result = await run(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], {
    env: { ...process.env, SECURE_NOTES_DOCKER_INSTALLER: installer },
  });
  if (result.code === 3010)
    throw new Error(
      'Docker installation requires a Windows restart. Restart Windows, then run this launcher again.',
    );
  if (result.code !== 0)
    throw new Error(
      'Docker Desktop installation did not complete. Read the installer error above.',
    );
}

async function main() {
  if (process.platform !== 'win32')
    throw new Error('Run start-windows-docker.cmd from Windows PowerShell or File Explorer.');
  process.chdir(projectRoot);
  await prepareLocalEnvironment();
  loadEnvFile(resolve(projectRoot, '.env'));
  const port = Number(process.env.PORT || 3000);
  const origin = localOrigin(process.env.APP_ORIGIN || 'http://localhost:3000', port);
  const apiOrigin = new URL(`http://localhost:${port}`);
  const powershell = resolve(
    process.env.SystemRoot || 'C:\\Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  );
  let docker = await findDocker();
  if (!docker) {
    await installDocker(powershell);
    docker = await findDocker();
  }
  if (!docker)
    throw new Error(
      'Docker CLI was not found after installation. Restart Windows and rerun the launcher.',
    );

  const desktop = await firstExisting(
    installDirectories().map((path) => resolve(path, 'Docker Desktop.exe')),
  );
  const commandEnv = dockerCommandEnvironment(process.env, docker, installDirectories());
  delete commandEnv.DOCKER_HOST;
  delete commandEnv.DOCKER_CONTEXT;
  let context;
  async function chooseContext() {
    for (const name of ['desktop-linux', 'default']) {
      const result = await run(
        docker,
        ['context', 'inspect', name, '--format', '{{json .Endpoints.docker.Host}}'],
        {
          capture: true,
          timeout: 5000,
          env: commandEnv,
        },
      );
      if (result.code !== 0) continue;
      try {
        if (isLocalDockerEndpoint(JSON.parse(result.output.trim()))) return name;
      } catch {}
    }
    return null;
  }
  async function linuxEngineReady() {
    if (!context) return false;
    const result = await run(docker, ['--context', context, 'info', '--format', '{{.OSType}}'], {
      capture: true,
      timeout: 8000,
      env: commandEnv,
    });
    return result.code === 0 && result.output.trim() === 'linux';
  }

  context = await chooseContext();
  if (!(await linuxEngineReady())) {
    if (!desktop)
      throw new Error(
        'Docker Desktop was not found. Install/start its Linux-container engine and rerun.',
      );
    console.log('Starting Docker Desktop and waiting for its local Linux engine.');
    const gui = spawn(desktop, [], { detached: true, stdio: 'ignore', windowsHide: false });
    gui.on('error', () => {});
    gui.unref();
    const deadline = Date.now() + 180000;
    let ready = false;
    while (Date.now() < deadline) {
      context = await chooseContext();
      if (await linuxEngineReady()) {
        ready = true;
        break;
      }
      await delay(3000);
    }
    if (!ready)
      throw new Error(
        'Docker Linux engine did not start. Check Docker Desktop for a WSL update, restart, or Linux-container requirement.',
      );
  }

  const prefix = [
    '--context',
    context,
    'compose',
    '-p',
    'secure-notes-windows',
    '-f',
    'compose.windows.yaml',
  ];
  const compose = await run(docker, [...prefix, 'version'], { env: commandEnv });
  if (compose.code !== 0) throw new Error('Docker Compose is unavailable. Update Docker Desktop.');
  console.log('Building and starting MongoDB plus the application in Docker.');
  const up = await run(
    docker,
    [...prefix, 'up', '--build', '-d', '--wait', '--wait-timeout', '180'],
    { env: commandEnv },
  );
  if (up.code !== 0)
    throw new Error(
      'Docker startup failed. Read the build/container error above. Existing data volumes were not removed.',
    );
  await run(docker, [...prefix, 'ps'], { env: commandEnv });
  const health = await fetch(new URL('/health/ready', apiOrigin), {
    signal: AbortSignal.timeout(10000),
  });
  if (!health.ok || (await health.json()).status !== 'ready')
    throw new Error('The application did not pass its Windows localhost readiness check.');
  if (process.env.SERVE_FRONTEND !== 'false') {
    console.log(
      `\nDocker app is ready: ${origin.origin}\nContainers keep running after this window closes.\n`,
    );
    await run(
      powershell,
      ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process $env:SECURE_NOTES_LOCAL_URL'],
      {
        env: { ...process.env, SECURE_NOTES_LOCAL_URL: origin.origin },
      },
    ).catch(() => {});
  } else {
    console.log(
      `\nBackend API is ready: ${apiOrigin.origin}/api/v1\nAllowed frontend origin: ${origin.origin}\nContainers keep running after this window closes.\n`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    const safe = error.code
      ? `Command failed (${error.code}). Check Docker Desktop and the output above.`
      : error.message;
    console.error(safe);
    process.exitCode = 1;
  }
}
