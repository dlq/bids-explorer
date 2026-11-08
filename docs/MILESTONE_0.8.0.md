# 0.8.0 viewer handoff and cache validation

This record preserves the completed 0.8.0 observations moved from PLANS.md on November 8, 2026. It records the external-editor and resource-lifetime checks performed during that milestone. The current built-in viewer and optional external opening are described in the [user guide](USER_GUIDE.md); these historical checks do not replace later installed-package validation.

## Recorded release observations

Local validation opened loose and ZIP NIfTI fixtures in NiiVue 2.9.0 through VS Code 1.145.2. The standard extension-host suite verified ZIP handoff without NiiVue and confirmed that clearing the cache is blocked while a viewer tab is open in that window. A fresh source export passed dependency installation and VSIX packaging. On Rorqual, two disposable Remote SSH extension hosts opened loose and ZIP NIfTI fixtures with NiiVue 2.9.0 enabled in one host and disabled in the other. The checks verified editor selection, exact fixture bytes, and protection against cache clearing while the extracted image was open in the test window. A local two-window test reproduced deletion of an open extracted image and then verified the shared guard. Clearing was refused while the image tab was open and succeeded after it closed.

The fresh 0.8.0 source snapshot and later built-in-viewer compatibility checks are documented in [COMPATIBILITY.md](COMPATIBILITY.md). Progressive-loading measurements and their limitations remain in [RESEARCH.md](../RESEARCH.md).
