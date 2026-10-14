# Visual regression checks

The UI tests render server HTML without a browser layout engine. Use the docs demo
to check CSS alignment changes:

1. Run `pnpm docs-dev` and open `http://127.0.0.1:3013/docs/demo`.
2. Choose the Expanded example, keep Page history enabled, and enable Inline authors.
3. At a viewport width of 1200px, check that the release label shares the commit
   text's baseline and its icon is visually centered beside the label. Check the
   icon's visible strokes, not only its SVG bounding box: the tag outline carries
   more weight in its upper half and needs a small downward optical adjustment.
4. Repeat at 390px, where the message wraps and the commit hash is hidden. The
   release label should stay aligned with its line without horizontal overflow.
5. At both widths, the horizontal commit icon should align with the first line
   of each entry and keep its circular node round.
6. Inline authors must show both the avatar and readable name, including fallback
   avatars and multiple co-authors. The separator and date must stay on one line;
   they may move together to the next line after a long subject. Switch Relative
   dates off and Language to Chinese to check both date formats.
7. Cover representative combinations: default collapsed history, expanded history
   with inline authors, compact history without contributors or headings,
   contributors only, empty history, and both sections disabled. Test relative
   and absolute dates in English and Chinese, and the Co-authors example with its
   longer name and fallback avatar. At 1200px and 390px, check section visibility,
   translated labels, initial expansion, author names, date wrapping, and overflow.
   Changing an option preserves direct interactions except Start expanded, which
   starts a new preview.
8. After sorting or directly collapsing the history, Reset must restore the
   selected example's initial expansion and newest-first order. All seven examples
   must restore their documented options.

Regression: the release label used to sit above the surrounding text because an
inline flex container with an SVG first child supplied the label's baseline.
Check the label's text alignment, not just the icon's position. Browser text-range
measurements should differ in vertical center by no more than 1 CSS pixel on the
same line (account for whole line-height increments when the label wraps).
