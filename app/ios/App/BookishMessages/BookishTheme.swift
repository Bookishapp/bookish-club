import UIKit
import CoreText

/// All extension colors, type choices, and art names live here or in Assets.xcassets.
enum BookishTheme {
    enum TypeStyle { case title, heading, body, caption, button }
    static let stickerAssets: [(name: String, label: String)] = [
        ("lunair-sticker-01-hi-book-club", "Hi, book club"),
        ("lunair-sticker-02-im-in", "I'm in"),
        ("lunair-sticker-03-see-you-thursday", "See you Thursday"),
        ("lunair-sticker-04-no-spoilers", "No spoilers"),
        ("lunair-sticker-05-i-cannot", "I cannot"),
        ("lunair-sticker-06-swooning", "Swooning"),
        ("lunair-sticker-07-not-crying", "Not crying"),
        ("lunair-sticker-08-spill-it", "Spill it"),
        ("lunair-sticker-09-plot-twist", "Plot twist"),
        ("lunair-sticker-10-one-more-chapter", "One more chapter"),
        ("lunair-sticker-11-youre-invited", "You're invited"),
        ("lunair-sticker-12-your-turn-to-host", "Your turn to host"),
        ("lunair-sticker-13-on-my-way", "On my way"),
        ("lunair-sticker-14-no-peeking", "No peeking")
    ]
    // Approved Oxblood Reading Room tokens from full-app-1016/src/base.py.
    static var cream: UIColor { color("Paper", 0xF5EAD8) }
    static var ink: UIColor { color("Ink", 0x2A0F15) }
    static var wine: UIColor { hex(0x7A1A2A) }
    static var muted: UIColor { hex(0x6B4C46) }
    static var card: UIColor { hex(0xFFFAF1) }
    static var green: UIColor { hex(0x1D5A46) }
    static var deepGreen: UIColor { hex(0x133B31) }
    static var pink: UIColor { color("Pink", 0xF4A6BF) }
    static var butter: UIColor { color("Butter", 0xECB74E) }
    static var mint: UIColor { color("Mint", 0xDCEBE1) }
    static var sky: UIColor { color("Sky", 0xF3D9D9) }
    static var lilac: UIColor { color("Lilac", 0xFBE1E8) }
    static var line: UIColor { hex(0x4A1420).withAlphaComponent(0.14) }
    static func hex(_ value: UInt32) -> UIColor {
        UIColor(red: CGFloat((value >> 16) & 255) / 255,
                green: CGFloat((value >> 8) & 255) / 255,
                blue: CGFloat(value & 255) / 255, alpha: 1)
    }
    private static func color(_ name: String, _ fallback: UInt32) -> UIColor {
        UIColor(named: name) ?? hex(fallback)
    }
    private static let registeredFonts: Void = {
        // Registration also supports the isolated simulator parity harness.
        for name in ["YoungSerif-Regular", "Manrope-SemiBold", "Manrope-ExtraBold"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "ttf", subdirectory: "Fonts") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }()
    static func font(_ style: TypeStyle, scalable: Bool = true) -> UIFont {
        _ = registeredFonts
        let size: CGFloat
        let textStyle: UIFont.TextStyle
        let name: String
        switch style {
        case .title: size = 26; textStyle = .title1; name = "YoungSerif-Regular"
        case .heading: size = 19; textStyle = .title3; name = "YoungSerif-Regular"
        case .body: size = 15; textStyle = .body; name = "Manrope-SemiBold"
        case .caption: size = 12; textStyle = .caption1; name = "Manrope-SemiBold"
        case .button: size = 15; textStyle = .headline; name = "Manrope-ExtraBold"
        }
        let base = UIFont(name: name, size: size) ?? UIFont.systemFont(ofSize: size)
        return scalable ? UIFontMetrics(forTextStyle: textStyle).scaledFont(for: base) : base
    }
    static func transcriptFont(_ style: TypeStyle) -> UIFont {
        let size: CGFloat
        switch style {
        case .title: size = 38
        case .heading: size = 31
        case .body: size = 25
        case .caption: size = 21
        case .button: size = 25
        }
        return font(style, scalable: false).withSize(size)
    }
    static func paperBackground(in view: UIView) {
        let paper = UIImageView(image: UIImage(named: "BookishPaper"))
        paper.contentMode = .scaleAspectFill
        paper.alpha = 0.55
        paper.clipsToBounds = true
        paper.isUserInteractionEnabled = false
        paper.isAccessibilityElement = false
        paper.translatesAutoresizingMaskIntoConstraints = false
        view.insertSubview(paper, at: 0)
        NSLayoutConstraint.activate([
            paper.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            paper.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            paper.topAnchor.constraint(equalTo: view.topAnchor),
            paper.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }
    static func accent(for kind: CardKind) -> UIColor {
        switch kind { case .rsvp: return pink; case .vote: return butter; case .bookmarks: return mint }
    }
    static func title(for kind: CardKind) -> String {
        switch kind { case .rsvp: return "Club night"; case .vote: return "Our next read"; case .bookmarks: return "Reading together" }
    }
    static func label(for choice: RSVPChoice) -> String {
        switch choice { case .yes: return "Yes"; case .maybe: return "Maybe"; case .cant: return "Can't" }
    }
    /// Approved square check, drawn as native vector geometry at every display scale.
    static func selectionMark(selected: Bool) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { _ in
            let box = UIBezierPath(roundedRect: CGRect(x: 1, y: 1, width: 22, height: 22), cornerRadius: 6)
            if selected { wine.setFill(); box.fill() }
            else { line.setStroke(); box.lineWidth = 1.5; box.stroke() }
            if selected {
                let tick = UIBezierPath(); tick.move(to: CGPoint(x: 6, y: 12))
                tick.addLine(to: CGPoint(x: 10, y: 16)); tick.addLine(to: CGPoint(x: 18, y: 7))
                tick.lineWidth = 2.5; tick.lineCapStyle = .round; tick.lineJoinStyle = .round
                card.setStroke(); tick.stroke()
            }
        }
    }
    /// Bundled covers correspond only to the existing sample books. Unknown books stay text-only.
    static func cover(for book: CandidateBook) -> UIImage? {
        let assets = ["pride": ("Pride and Prejudice", "Jane Austen"),
                      "frankenstein": ("Frankenstein", "Mary Shelley"),
                      "jane-eyre": ("Jane Eyre", "Charlotte Brontë")]
        guard let known = assets[book.id], known.0 == book.title, known.1 == book.author else { return nil }
        return UIImage(named: "Cover-" + book.id)
    }
    /// The URL model has no calendar date. Show a known weekday, without inventing a month or day.
    static func meetingDay(_ state: MessageState) -> String? {
        ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
            .first { state.meetingTitle.localizedCaseInsensitiveContains($0) }.map { String($0.prefix(3)).uppercased() }
    }
    static func art(for kind: CardKind) -> UIImage {
        let name: String
        switch kind {
        case .rsvp: name = "LunairRSVP"
        case .vote: name = "LunairVote"
        case .bookmarks: name = "LunairBookmarks"
        }
        // All three approved cutouts are bundled in the extension asset catalog.
        return UIImage(named: name) ?? UIImage()
    }
}
