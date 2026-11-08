# Open a study on a server with Remote SSH

Use BIDS Explorer to browse a study on your institution's server or computing cluster from desktop VS Code. You do not need to copy the study to your own computer or write code. SSH is the connection between your computer and the server; VS Code manages it for BIDS Explorer.

## Before you start

Have these details ready:

- Your server address or existing SSH host nickname, and your username.
- The study's folder path **on the server**, for example `/project/my-study`.
- Your usual sign-in method, including any VPN, SSH key or multi-factor authentication (MFA).
- Permission to read the study and use VS Code Remote SSH on that server. On a computing cluster, follow your institution's connection and login-node policies.

Use desktop VS Code 1.96 or newer. Remote SSH also needs a working SSH client on your computer and a compatible server; Microsoft's [Remote SSH setup guide](https://code.visualstudio.com/docs/remote/ssh#installation) covers those requirements. If you cannot normally sign in to the server, ask your institution's support team to help establish access first.

The addresses and paths below are examples. Replace them with your own; BIDS Explorer has no separate SSH account or password settings.

## 1. Install Remote - SSH on your computer

Open VS Code's **Extensions** view using the square-blocks icon on the left. Search for **Remote - SSH**, published by **Microsoft**, and choose **Install**. You can also open its [Marketplace page](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh).

This extension establishes the connection. You will install BIDS Explorer on the server after connecting.

## 2. Connect to the server

1. Open **View → Command Palette…**. The keyboard shortcut is **Cmd+Shift+P** on macOS or **Ctrl+Shift+P** on Windows/Linux.
2. Search for **Remote-SSH: Connect to Host…** and select it.
3. Choose your existing host nickname, or enter your username and server address, such as `yourname@login.example.org`.
4. If asked for the server's operating system, select the correct one; many research clusters use Linux.
5. Complete the sign-in prompts. Password, key-passphrase and MFA prompts may appear in the **prompt bar at the top of the window**, rather than a separate dialog. Your institution may also require approval on your phone. For a first-connection host-key prompt, verify the server identity using your institution's instructions.

VS Code opens a remote window and may take a little time to set up its server component on the first connection. Check the **bottom-left corner**: it should show **SSH: your-host**. This tells you that this window is connected to the server.

To save a host for later, use **Remote-SSH: Add New SSH Host…** from the Command Palette. Existing institutional SSH configurations can include gateways or special ports; follow the site's instructions rather than replacing that configuration.

## 3. Open the remote study folder

In the window showing **SSH: your-host**, choose **File → Open Folder…** and select or type the study's server path. Choose the folder containing `dataset_description.json`, rather than a parent containing many studies. The folder picker now refers to the **server's files**, not your computer's files. Enter a folder path, not an `ssh user@host` command or a `host:/path` address.

For a study stored in ZIPs, tarballs or SquashFS shards, open the folder containing those archives. Do not extract or repack a large collection just to browse it. Some collections need explicit registration; the next step explains where to start.

If VS Code asks whether you trust the folder, trust it only if you trust its contents. BIDS Explorer requires a trusted workspace.

## 4. Install BIDS Explorer on the server

Still in the remote window, open **Extensions**, search for **BIDS Explorer** by **Darcy Quesnel (`MCIN-dlq`)**, and choose **Install** or **Install in SSH: your-host**, as offered.

Check that it appears in the installed extensions for **SSH: your-host**. Having it installed only under **Local** is not sufficient for this remote study. Repeat this installation when using a different server if needed.

## 5. Browse the study

Open **Explorer** and expand **BIDS**. A workspace folder with an ordinary root-level `dataset_description.json` should appear automatically. Expand a participant, session if present, and modality, then select a scan or metadata entry.

If the study does not appear, use **Add Dataset** in the BIDS section, or run **BIDS Explorer: Add Dataset** from the Command Palette. Select its folder on the server. For descriptorless archive collections and custom placements, see the [explorer reference](EXPLORER_REFERENCE.md).

Try opening a JSON sidecar and a NIfTI image. **Inspect Metadata and Related Files** shows inherited acquisition values and their sources. **Image controls** opens the imaging sidebar. To position it on the right, use the sidebar activity icon's **Move To → Secondary Side Bar** menu. The [user guide](USER_GUIDE.md) explains tables, gradients and participant availability.

Browsing is read-only. Opening an original file in a regular editor is a separate action that can allow edits.

## What stays on the server?

Directory reads, archive indexing and selected-member extraction run on the server. Supported inventories and availability snapshots are cached there; extracted images use private extension storage outside the dataset. Browsing does not download the whole study or unpack a whole archive. Selected image bytes still travel to your computer for display, so large scans can take time and the local viewer uses memory/GPU resources. See [supported formats and limits](COMPATIBILITY.md).

**Terminal → New Terminal** in this remote window opens a terminal on the server. Commands there can change remote files independently of BIDS Explorer; no terminal commands are required for this walkthrough.

## Reconnect or get help

To finish, choose **File → Close Remote Connection**. Later, reconnect through **Remote-SSH: Connect to Host…** and reopen the same study folder. Supported cached indexes can be reused; other listings are read again. Reconnecting may require fresh MFA.

If connection setup appears stuck, check the top prompt bar and notifications first. Open **View → Output** and select **Remote - SSH** for connection details. If an authentication prompt is hidden, Microsoft's [authentication troubleshooting](https://code.visualstudio.com/docs/remote/troubleshooting#enabling-alternate-ssh-authentication-methods) explains the **Remote.SSH: Show Login Terminal** setting.

If the remote files open but BIDS does not appear, check that BIDS Explorer is enabled on the SSH host and that the folder is trusted. Use our [SSH and study troubleshooting](TROUBLESHOOTING.md) for the next steps. Share error messages without credentials, login codes or private study details. Connection failures and server outages must be resolved before BIDS Explorer can read the data.
