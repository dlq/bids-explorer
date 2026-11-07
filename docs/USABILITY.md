# Usability verification for 1.0

The audience is neuroimaging researchers and staff who understand participants, sessions, modalities and derivatives and may be unfamiliar with programming or VS Code. The interface should lead with study information and recorded values. Exact source names and provenance remain available for inspection.

## November 7, 2026 checks

The checks used the current 0.9.0 source in a VS Code 1.145.2 development window on macOS arm64. The study was synthetic and outside the repository. It contained two participants, uneven session coverage, raw and derivative NIfTI files, event tables, participant/session/scan information, dataset history and diffusion gradients. The imaging fixtures were tiny test volumes.

| Workflow            | Observed result                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Study tree          | Arrow keys expanded participants, sessions and modalities. Enter opened a selected gradient pair, NIfTI and CHANGES preview.                                                                                                                                                                                                       |
| Diffusion gradients | Controls exposed names for cutoff, tolerance, volume selection and rotation. Plot descriptions explained the axes and keyboard controls. Light, Dark Modern and Dark High Contrast rendered the plots and labels. The high-contrast grid followed the theme border color.                                                          |
| Inherited metadata  | The selected functional scan inherited TaskName, RepetitionTime and EchoTime from the study-level task JSON. Tab reached the report action and filter. Typing RepetitionTime left the corresponding field visible. Dark and high-contrast views showed the field and its source information with a visible filter focus indicator. |
| NIfTI viewer        | The loading status exposed the loaded frame count. A single-frame image had a disabled frame control. A two-frame image exposed a Frame slider; Tab reached it and Right changed its value from 1 to 2. Images and controls were inspected in dark and high-contrast views.                                                        |
| Dataset history     | Enter opened the selected CHANGES file. The heading showed its recorded version and date, and the accessibility tree exposed the filter and source actions.                                                                                                                                                                        |

The November 6 candidate pass separately checked participant-table rendering in dark and high contrast, participant filtering, dataset-description filtering by readable field name, and keyboard entry into Participant Availability. Those observations remain in [Compatibility](COMPATIBILITY.md).

## Follow-up walkthrough and fixes

The same synthetic study and a two-shard synthetic SquashFS collection were used for the follow-up. VoiceOver was running with spoken output and captions, confirmed by the user. The user also confirmed clear announcements for participant-table headers, Filter rows, the empty-result count, the failed-reload message and expanded shard-source choices. This is user-assisted spoken verification; the automation tool did not capture speech or captions.

- Participant filtering showed zero matching rows for an unmatched query. An oversized synthetic source produced a reload alert while preserving the previous snapshot and filter. Restoring the source and reloading recovered successfully.
- Grouped dataset descriptions exposed shared fields, different per-shard values and expandable source choices. Long description values revealed horizontal overflow; shared preview styles now wrap long values and paths.
- The sessions table exposed named headers and recorded baseline/follow-up values in high contrast. At increased zoom, table content required horizontal scrolling. Tables, gradient numeric data and availability grids now have named, keyboard-focusable scrolling regions with visible focus indicators. Tab entry was checked manually; automated integration checks assert the table region remains focusable.
- Inherited acquisition values remain prominent, with repeated provenance paths under a collapsed Source details disclosure. Integration checks verify those disclosures start collapsed and preserve source information.
- Image position now provides six named buttons to move the crosshair one voxel along X, Y or Z and a live coordinate output. Integration tests load both `.nii` and `.nii.gz`, activate the X button and verify changed coordinates without pointer navigation. The existing manual walkthrough checked the Frame slider. The new spatial buttons have automated verification; a further user-operated spatial walkthrough is useful follow-up.
- Availability and gradient summaries now use singular labels for one match, participant, volume or direction.

The original Light 2026 theme and pre-test zoom were restored. VoiceOver was left running. Only synthetic test files were modified.

## Automated verification

After the fixes, `npm run check` passed all 157 unit tests and the per-file coverage gate, formatting, type checking and linting. The integration suite passed 44 tests on VS Code 1.96.0 and 44 on 1.145.2, with the opt-in private SSH case pending on each. `npm run security` passed all three rule fixtures and found no issues in the source scan. No release version or tag was created.

## Scope of the evidence

These checks cover representative keyboard, theme, error-recovery and user-assisted spoken workflows on macOS. Shared table behavior also has integration coverage for participant, session, scan and event previews. This is not a full accessibility conformance assessment or a spoken walkthrough of every preview, operating system and assistive technology. Long-value wrapping and the new spatial controls still benefit from further visual/user feedback; automated checks do not substitute for that feedback.

The installed release still requires a trusted workspace. A development host ran the synthetic study in Restricted Mode during these checks. That behavior does not change the installed extension's declared Workspace Trust requirement.

## Logical acquisition follow-up

A later November 7 development-host check used the same synthetic study with the shortened BIDS sidebar title and readable logical labels. The native file-tree section was collapsed to give the BIDS section room. The Functional branch displayed **BOLD · task motor**; arrow-key navigation expanded it into **Image**, **Acquisition metadata** and **Events**. After expansion, **TR 2 s · TE 30 ms** appeared from the recorded task JSON. This was a rendered-tree/keyboard check, without another user-assisted spoken assessment. The fixture had no acquisition-local JSON, so the metadata action used inherited study context.

Automated acquisition checks cover loose files, ZIP, tar and SquashFS, exact resource grouping, preserved source identities, inherited timing summaries, refresh and partial coverage. Unit regressions additionally check conflicting SquashFS sidecars and withheld effective values when ancestor inventories are paged. Image geometry and diffusion-shell tree summaries remain follow-up work.

## Session derivatives and metadata ordering

The November 7 synthetic-study development window was reloaded for a native-tree check. Participant **01** displayed **Sessions** before its session branches. Session **01** displayed **Scans** before Diffusion, Functional and Derivatives. Expanding **Derivatives → demo** led directly to **Anatomical**, without another session or Raw branch. Session derivatives have an explicit accessible label identifying their session. This check observed native-tree navigation and accessible structure; it did not add another spoken VoiceOver walkthrough.

Integration checks also cover derivative-only sessions, exact session matching, separately linked sessionless outputs, and metadata before acquisition subtrees while preserving semantic content and numeric run ordering.

## Public logical-layout workspace

The prepared **Logical Layout Examples** workspace was opened in the current development host. All three dataset roots (ds004662 raw subset, ds007661 derivative subset and the official ds000117 example) appeared automatically in BIDS. The native file section was collapsed to give the logical tree room. The user-facing walkthrough, opt-in test instructions, source scope and structured results are in [TEST_DATA.md](TEST_DATA.md#logical-layout-examples--november-7-2026). Automated checks on both supported VS Code versions opened real raw and processed 210-frame images; the official example's empty imaging files were used only for navigation and literal metadata.

### Native Image view follow-up — November 7, 2026

VS Code 1.145.2, macOS, Logical Layout Examples development workspace, light theme and restricted mode. Moved the **BIDS Image** view container through the native **Move To → Secondary Side Bar** menu. Opened the real ds004662 participant 01/run 1/echo 1 BOLD image from the logical tree. The viewer completed all 210 frames. The right-hand view displayed acquisition context, header dimensions/spacing and inherited TR/TE; source/related sections remained collapsed. Selecting **Coronal** in the native sidebar changed the renderer layout. The view retained focus during the interaction. Automated extension-host checks separately cover frame/window/colour-map/crosshair controls, reset, image switching/disposal, literal dataset text and rejection of queued controls targeting a previous image. This follow-up is not a new VoiceOver announcement audit or a remote performance measurement.
