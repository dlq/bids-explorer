# Troubleshooting BIDS Explorer

Start by noting your BIDS Explorer version, VS Code version, whether the data are local or over SSH, and whether you are opening folders, ZIP, tarballs or SquashFS. Use a public or synthetic example when reporting a problem.

## I cannot find the BIDS section

Open VS Code's regular **Explorer** sidebar and look for **BIDS**. If it is hidden, open the Explorer's **…** menu and enable the view. The extension is named BIDS Explorer, while the section title is BIDS.

In an SSH window, open Extensions and check that BIDS Explorer is installed and enabled on the **connected server**, not just on your own computer. Activation requires a trusted workspace; use VS Code's Workspace Trust controls only for folders you trust.

## My study does not appear automatically

Automatic recognition looks for an ordinary root-level `dataset_description.json` in each open workspace folder. It does not recursively search a parent directory or validate a study. Open the study root, or choose **BIDS Explorer: Add Dataset** in the Command Palette and select its folder.

For archives, add the containing directory. Descriptorless collections may need an explicit collection declaration; see [collections and placements](EXPLORER_REFERENCE.md). If the archive contains no recognizable BIDS structure, the native File Explorer is still available.

## SSH is waiting, reconnecting or asking for MFA

BIDS Explorer uses **VS Code Remote SSH**. It has no separate password or SSH configuration. Check VS Code's notification area and the prompt bar at the top of the window; MFA/password prompts can appear there. Complete that prompt before retrying.

If the connection itself fails, open **View → Output**, select the Remote SSH output channel and follow Microsoft's [Remote SSH troubleshooting](https://code.visualstudio.com/docs/remote/troubleshooting). Confirm ordinary remote folder access before diagnosing the BIDS view. Do not post login codes, credentials or unredacted server logs in public issues.

## Some files, participants or processing outputs look missing

The logical BIDS tree omits administrative and unrecognized entries. Use **Show Dataset in File Explorer** for the physical file view; omission is not failed validation or permission to delete a file.

Check paging and reported coverage. **Not checked** and unreadable sources are not the same as **Missing**. Use Refresh to retry a changed or failed branch. Separate raw and derivative datasets need [explicit links](EXPLORER_REFERENCE.md#link-separate-raw-and-derivative-datasets); matching participant names alone do not link studies. Unsupported shards can make collection coverage partial.

## An archive reports unsupported compression

ZIP supports unencrypted stored/Deflate members; tar supports the documented POSIX ustar `.tar`, `.tar.gz` and `.tgz` variants; SquashFS supports uncompressed/gzip blocks. Installing a system archive tool does not add a codec to the bundled reader. See the [compatibility matrix](COMPATIBILITY.md), [ZIP](ZIP.md), [tar](TAR.md) and [SquashFS](SQUASHFS.md) limits.

Keep the original archive. Do not convert, repack or modify a research dataset as an automatic troubleshooting step.

## An image is slow to open or says No image data

A selected archived image must be prepared in the image cache before it opens. Tar member reads can require a sequential scan. A large 4D NIfTI can show its first volume while the rest loads; volume navigation becomes available when loading completes.

The current viewer accepts up to 1 GiB decoded data, with a 128 MiB first-frame budget. Selected archive extraction is limited to 512 MiB per member. Large studies also need enough workspace-host storage for caches. Exceeding a limit should produce an explanation; record that message when reporting a problem.

Some BIDS example repositories deliberately contain empty MRI placeholders. **No image data** is expected for those files. The [quick-start sample](QUICKSTART.md) contains real images.

## The preview is stale or a cache is full

Use **Reload snapshot** in metadata/table previews. Refresh the dataset or affected tree branch after source changes. Close an image viewer and reopen it to reread changed image contents; simply selecting it again reveals the existing viewer.

To clear extracted images, close that workspace's image viewers and source editor tabs in **every VS Code window** using it, then run **BIDS Explorer: Clear Extracted Image Cache**. A live viewer in another window can correctly prevent clearing. Do not delete dataset files to free extension-cache space.

## Image controls are missing or in the wrong place

Choose **Image controls** in the built-in viewer. To place them on the right, right-click **Imaging** and choose **Move To → Secondary Side Bar**. VS Code remembers view placement. Expand **Position** for keyboard crosshair buttons; single-volume images intentionally have no volume selector.

## I have two copies or get an already exists command error

The old development identifier is `bids-explorer-dev.bids-explorer`; the production identifier is `MCIN-dlq.bids-explorer`. Disable or uninstall the old development copy before installing the production one. In a remote window, check installed copies on both the local machine and server. Manual registrations and placements may need to be recreated because VS Code treats these as different extensions; ordinary dataset files are unchanged.

## Report a reproducible problem

Use the [problem-report form](https://github.com/dlq/bids-explorer/issues/new/choose) with the failing action, expected/resulting behavior, versions, operating systems and storage format. Share a small public/synthetic reproduction where possible. Remove participant identifiers, private paths and sensitive images or metadata from screenshots and logs. Use [private security reporting](https://github.com/dlq/bids-explorer/security/advisories/new) for suspected vulnerabilities.
