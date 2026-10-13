# Visual regression checks

The UI tests render server HTML without a browser layout engine. Use the docs demo
to check CSS alignment changes:

1. Run `pnpm docs-dev` and open `http://127.0.0.1:3013/docs/demo`.
2. Keep Page history enabled and expand its history panel.
3. At a viewport width of 1200px, check that the release label shares the commit
   text's baseline and its icon is visually centered beside the label. Check the
   icon's visible strokes, not only its SVG bounding box: the tag outline carries
   more weight in its upper half and needs a small downward optical adjustment.
4. Repeat at 390px, where the message wraps and the commit hash is hidden. The
   release label should stay aligned with its line without horizontal overflow.
5. At both widths, the horizontal commit icon should align with the first line
   of each entry and keep its circular node round.

Regression: the release label used to sit above the surrounding text because an
inline flex container with an SVG first child supplied the label's baseline.
Check the label's text alignment, not just the icon's position. Browser text-range
measurements should differ in vertical center by no more than 1 CSS pixel on the
same line (account for whole line-height increments when the label wraps).
