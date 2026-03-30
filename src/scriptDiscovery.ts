import * as vscode from 'vscode';
import * as path from 'path';
import type { ScriptInfo } from './types';

const LOCK_FILE_MAP: Record<string, string> = {
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
};

export async function detectPackageManager(folderUri: vscode.Uri): Promise<string> {
  const config = vscode.workspace.getConfiguration('scriptRunner');
  const configured = config.get<string>('packageManager', 'auto');

  if (configured !== 'auto') {
    return configured;
  }

  for (const [lockFile, pm] of Object.entries(LOCK_FILE_MAP)) {
    try {
      const lockUri = vscode.Uri.joinPath(folderUri, lockFile);
      await vscode.workspace.fs.stat(lockUri);
      return pm;
    } catch {
      // Lock file doesn't exist, try next
    }
  }

  return 'npm';
}

export async function discoverScripts(): Promise<ScriptInfo[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return [];
  }

  const config = vscode.workspace.getConfiguration('scriptRunner');
  const scanNested = config.get<boolean>('scanNested', true);

  const allScripts: ScriptInfo[] = [];

  if (scanNested) {
    // Recursive scan: find all package.json files excluding node_modules
    const packageJsonFiles = await vscode.workspace.findFiles(
      '**/package.json',
      '**/node_modules/**'
    );

    for (const fileUri of packageJsonFiles) {
      const folderUri = vscode.Uri.joinPath(fileUri, '..');
      const scripts = await extractScripts(fileUri, folderUri);
      allScripts.push(...scripts);
    }
  } else {
    // Root-only scan
    for (const folder of workspaceFolders) {
      const packageJsonUri = vscode.Uri.joinPath(folder.uri, 'package.json');
      const scripts = await extractScripts(packageJsonUri, folder.uri);
      allScripts.push(...scripts);
    }
  }

  // Sort by workspace name, then script name
  allScripts.sort((a, b) => {
    const wsCompare = a.workspaceName.localeCompare(b.workspaceName);
    if (wsCompare !== 0) { return wsCompare; }
    return a.name.localeCompare(b.name);
  });

  return allScripts;
}

async function extractScripts(packageJsonUri: vscode.Uri, folderUri: vscode.Uri): Promise<ScriptInfo[]> {
  const scripts: ScriptInfo[] = [];

  try {
    const content = await vscode.workspace.fs.readFile(packageJsonUri);
    const packageJson = JSON.parse(Buffer.from(content).toString('utf-8'));

    if (!packageJson.scripts || typeof packageJson.scripts !== 'object') {
      return scripts;
    }

    const folderPath = folderUri.fsPath;
    const workspaceName = getWorkspaceName(folderUri);
    const packageManager = await detectPackageManager(folderUri);

    for (const [name, command] of Object.entries(packageJson.scripts)) {
      if (typeof command === 'string') {
        scripts.push({
          name,
          command,
          workspaceFolder: folderPath,
          workspaceName,
          packageManager,
        });
      }
    }
  } catch {
    // Invalid JSON or file not found — skip
  }

  return scripts;
}

function getWorkspaceName(folderUri: vscode.Uri): string {
  const workspaceFolders = vscode.workspace.workspaceFolders || [];

  // Check if this is a direct workspace folder
  for (const wsFolder of workspaceFolders) {
    if (wsFolder.uri.fsPath === folderUri.fsPath) {
      return wsFolder.name;
    }
  }

  // For nested folders, show relative path from workspace root
  for (const wsFolder of workspaceFolders) {
    const relativePath = path.relative(wsFolder.uri.fsPath, folderUri.fsPath);
    if (relativePath && !relativePath.startsWith('..')) {
      return relativePath.replace(/\\/g, '/');
    }
  }

  return path.basename(folderUri.fsPath);
}

export function getScriptId(workspaceFolder: string, scriptName: string): string {
  return `${workspaceFolder}::${scriptName}`;
}
