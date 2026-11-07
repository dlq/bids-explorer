// Intentionally unsafe, non-executable Semgrep fixtures; never compiled or packaged.
import { exec, execSync as runSync, execFile, spawn } from 'node:child_process';

// ruleid: no-shell-command-execution
exec('cat ' + memberPath);
// ruleid: no-shell-command-execution
runSync('tar xf ' + containerPath);
// ok: no-shell-command-execution
execFile('unsquashfs', ['-cat', containerPath, memberPath]);
// ruleid: no-shell-enabled-process
spawn('tar', ['tf', containerPath], { shell: true });
// ok: no-shell-enabled-process
spawn('tar', ['tf', containerPath], { shell: false });
// ok: no-shell-command-execution
/sub-(\w+)/.exec(filename);
// ruleid: no-dynamic-code
eval(metadata);
// ruleid: no-dynamic-code
new Function(metadata);
// ok: no-dynamic-code
JSON.parse(metadata);
