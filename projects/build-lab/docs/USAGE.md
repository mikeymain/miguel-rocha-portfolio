# Build Lab usage

[Project overview](../README.md)

## Edit and compare

Set body dimensions and attributes, lock values that should remain fixed, and review linked changes and budget limits. Undo restores the previous edit. Save configurations for side-by-side comparison, share them through links or export an image.

## Search configurations

1. In **Build Finder**, choose a height range and the ratings required after cap breakers.
2. Mark targets as **Must** or best effort. Targets can come from a body's maximum or a badge tier. Cap breakers apply only to Must targets.
3. Choose whether to spend the available cap-breaker budget or rank results by **Fewest needed**.
4. Review qualifying bodies and their projected ratings. If no body qualifies, the finder reports the closest options and missing requirements.

Target limits follow the other Must targets; the latest edit takes precedence. Only bodies that can reach every Must target are searched. Searches run in a Web Worker and can be cancelled.

**Minimize caps** searches for the fewest cap breakers that retain the after-cap ratings within the overall budget.

## Import a screenshot

Use **Import** with a screenshot of the in-game MyCareer Attribute Upgrades screen. Full, cropped and resized screenshots are supported. Tesseract.js reads body settings and ratings in the browser; the screenshot is not uploaded. The first import downloads the OCR engine and English language data from the jsDelivr CDN. Review the detected values before loading the build and its matching cap breakers.

## Interpretation

The planner uses externally sourced game rules. Check the [accuracy notes](../README.md#accuracy) before relying on a configuration in the game.
