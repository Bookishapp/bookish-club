# Approved landing v2 comparison

Left is approved, and right is the production build in Google Chrome.

- [1440px approved desktop frame versus build](approved-vs-built-1440.jpg)
- [390px approved mobile frame versus build](approved-vs-built-390.jpg)
- [375px approved source reflow versus build](approved-vs-built-375.jpg)
- [Master-copy study, thumbnails, values, construction, color comps, and line study](process-strip.jpg)

The approved mobile frame was authored at 390px. The 375px comparison uses the same approved HTML reflowed at 375px, with no design changes. Desktop and 390px comparisons use the original, uncompressed approved PNGs at their native CSS widths.

The closed Browse clubs disclosure retains the approved button and opens the existing city, ZIP, and genre search. The footer adds a More Bookish disclosure to preserve Read next, Resources, listing, claim, About, and Terms links. This accounts for the extra 71px of page height. Prototype buttons now navigate to real routes, headings are semantic, and decorative images have empty text alternatives.

The approved body, phone, cards, drawing, red wall, font axes, hard shadows, and section order are preserved. Tablet widths use a stacked layout to keep the phone in view.

Technique: value grouping, ink edge control, overlap, and repetition with variation. Cream type and a white phone form the primary masses on the red wall; butter stickers carry the focal accents. The visual critique included a thumbnail view, a grayscale study, a horizontal flip, and section-by-section comparison with the approved reference.

Verification used local data fixtures and blocked external browser requests. No real form submissions were made.

## Ted review, fix round 1

The hero lead now uses a comma after “and more.” The six illustration and phone PNGs are WebP at twice their displayed widths, ranging from 45,504 to 74,426 bytes each. Their total transfer size fell from 2,790,409 to 382,072 bytes. Every landing image has intrinsic width and height, and the below-the-fold images load lazily. The root clips horizontal overflow.

The comparisons and process strip were refreshed after scrolling through the page in Chrome to exercise lazy loading. The existing Support route from current main remains available in the footer disclosure. Chrome verified 375, 390, 768, 1024, and 1440 widths. No Safari session was used, so iOS Safari behavior is not represented as device-tested.
