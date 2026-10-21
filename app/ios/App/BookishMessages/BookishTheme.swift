import UIKit

/// All extension colors, type choices, and art names live here or in Assets.xcassets.
enum BookishTheme {
    enum TypeStyle { case title, heading, body, caption, button }
    static let stickerAssets: [(name: String, label: String)] = [
        ("lunair_yes", "Yes. Bookish sticker."),
        ("lunair_maybe", "Maybe. Bookish sticker."),
        ("lunair_cant_make_it", "Can't make it. Bookish sticker."),
        ("lunair_book_club", "Book club. Bookish sticker."),
        ("lunair_one_more_chapter", "One more chapter. Bookish sticker."),
        ("lunair_bookmark", "Bookmark. Bookish sticker.")
    ]
    static var cream: UIColor { color("Paper", 0xFFF8EC) }
    static var wine: UIColor { color("Ink", 0x6F2940) }
    static var pink: UIColor { color("Pink", 0xF8CADB) }
    static var butter: UIColor { color("Butter", 0xF8E7A4) }
    static var mint: UIColor { color("Mint", 0xD2E9D9) }
    static var sky: UIColor { color("Sky", 0xCCE5F1) }
    static var lilac: UIColor { color("Lilac", 0xDFD2EC) }
    private static func color(_ name: String, _ hex: UInt32) -> UIColor {
        UIColor(named: name) ?? UIColor(red: CGFloat((hex >> 16) & 255) / 255,
                                      green: CGFloat((hex >> 8) & 255) / 255,
                                      blue: CGFloat(hex & 255) / 255, alpha: 1)
    }
    static func font(_ style: TypeStyle, scalable: Bool = true) -> UIFont {
        let size: CGFloat
        let textStyle: UIFont.TextStyle
        let weight: UIFont.Weight
        switch style {
        case .title: size = 28; textStyle = .title1; weight = .bold
        case .heading: size = 21; textStyle = .title3; weight = .semibold
        case .body: size = 17; textStyle = .body; weight = .regular
        case .caption: size = 14; textStyle = .caption1; weight = .regular
        case .button: size = 17; textStyle = .headline; weight = .semibold
        }
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        let descriptor = style == .title || style == .heading
            ? (base.fontDescriptor.withDesign(.serif) ?? base.fontDescriptor) : base.fontDescriptor
        let font = UIFont(descriptor: descriptor, size: size)
        return scalable ? UIFontMetrics(forTextStyle: textStyle).scaledFont(for: font) : font
    }
    static func transcriptFont(_ style: TypeStyle) -> UIFont {
        let base = font(style, scalable: false)
        let size: CGFloat
        switch style {
        case .title: size = 40
        case .heading: size = 32
        case .body: size = 26
        case .caption: size = 22
        case .button: size = 26
        }
        return base.withSize(size)
    }
    static func accent(for kind: CardKind) -> UIColor {
        switch kind { case .rsvp: return pink; case .vote: return butter; case .bookmarks: return mint }
    }
    static func title(for kind: CardKind) -> String {
        switch kind { case .rsvp: return "Club night"; case .vote: return "Our next read"; case .bookmarks: return "Our bookmarks" }
    }
    static func label(for choice: RSVPChoice) -> String {
        switch choice { case .yes: return "Yes"; case .maybe: return "Maybe"; case .cant: return "Can't" }
    }
    static func art(for kind: CardKind) -> UIImage {
        let name: String
        switch kind {
        case .rsvp: name = "LunairRSVP"
        case .vote: name = "LunairVote"
        case .bookmarks: name = "LunairBookmarks"
        }
        if let asset = UIImage(named: name) { return asset }
        // Drawn book placeholder. Replace the named image set with final Lunair art.
        return UIGraphicsImageRenderer(size: CGSize(width: 200, height: 120)).image { _ in
            accent(for: kind).setFill()
            UIBezierPath(roundedRect: CGRect(x: 0, y: 0, width: 200, height: 120), cornerRadius: 20).fill()
            cream.setFill()
            let book = UIBezierPath(roundedRect: CGRect(x: 44, y: 22, width: 112, height: 76), cornerRadius: 9)
            book.fill(); wine.setStroke(); book.lineWidth = 3; book.stroke()
            let spine = UIBezierPath(); spine.move(to: CGPoint(x: 100, y: 24)); spine.addLine(to: CGPoint(x: 100, y: 96))
            spine.lineWidth = 3; spine.stroke()
            pink.setFill(); UIBezierPath(rect: CGRect(x: 122, y: 23, width: 12, height: 30)).fill()
        }
    }
}
