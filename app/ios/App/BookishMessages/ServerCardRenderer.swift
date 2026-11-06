import UIKit
import CoreText

/// Approved 44, 41, and 42 compositions. Tea uses decorative bars, never blurred text.
enum ServerCardRenderer {
    private static let cream = UIColor(red: 245/255, green: 234/255, blue: 216/255, alpha: 1)
    private static let paper = UIColor(red: 1, green: 250/255, blue: 241/255, alpha: 1)
    private static let ink = UIColor(red: 42/255, green: 15/255, blue: 21/255, alpha: 1)
    private static let wine = UIColor(red: 122/255, green: 26/255, blue: 42/255, alpha: 1)
    private static let muted = UIColor(red: 107/255, green: 76/255, blue: 70/255, alpha: 1)
    private static let green = UIColor(red: 29/255, green: 90/255, blue: 70/255, alpha: 1)
    private static let pink = UIColor(red: 244/255, green: 166/255, blue: 191/255, alpha: 1)
    private static let butter = UIColor(red: 236/255, green: 183/255, blue: 78/255, alpha: 1)

    private static let registeredFonts: Void = {
        for name in ["YoungSerif-Regular", "Manrope-SemiBold", "Manrope-ExtraBold"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "ttf", subdirectory: "Fonts") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }()
    static func image(for card: ServerMessageCard) -> UIImage {
        _ = registeredFonts
        let height: CGFloat = card.kind == .take ? 410 : card.kind == .vote ? 600 : 480
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: 600, height: height), format: format).image { _ in
            paper.setFill(); UIBezierPath(rect: CGRect(x: 0, y: 0, width: 600, height: height)).fill()
            switch card.kind {
            case .take: tea(card)
            case .vote: vote(card)
            case .meeting: meeting(card)
            }
            cream.setFill(); UIBezierPath(rect: CGRect(x: 0, y: height - 102, width: 600, height: 102)).fill()
            text(card.kind == .take ? "New take on \(card.title)" : card.kind == .vote ? "Open Bookish to vote" : "Are you coming?", x: 28, y: height - 88, width: 544, height: 38, size: 25, bold: true)
            let detail = card.kind == .take ? (card.didNotFinish == true ? "Sealed until you finish the book" : "Sealed until you reach \(card.pageMarker)") : card.kind == .vote ? "A shared snapshot. Everyone gets a say." : "Address for members only"
            text(detail, x: 28, y: height - 45, width: 544, height: 30, size: 21, color: muted)
        }
    }
    private static func tea(_ card: ServerMessageCard) {
        // Hand-drawn mask mark follows approved 44, with no identity-bearing avatar.
        ink.setFill(); UIBezierPath(ovalIn: CGRect(x: 28, y: 27, width: 46, height: 46)).fill()
        let mask = UIBezierPath(); mask.move(to: CGPoint(x: 36, y: 44))
        mask.addQuadCurve(to: CGPoint(x: 66, y: 44), controlPoint: CGPoint(x: 51, y: 50))
        mask.addCurve(to: CGPoint(x: 51, y: 59), controlPoint1: CGPoint(x: 65, y: 64), controlPoint2: CGPoint(x: 57, y: 57))
        mask.addCurve(to: CGPoint(x: 36, y: 44), controlPoint1: CGPoint(x: 43, y: 63), controlPoint2: CGPoint(x: 37, y: 59))
        paper.setFill(); mask.fill()
        ink.setFill()
        UIBezierPath(ovalIn: CGRect(x: 41, y: 49, width: 6, height: 3)).fill()
        UIBezierPath(ovalIn: CGRect(x: 55, y: 49, width: 6, height: 3)).fill()
        text("Anonymous", x: 88, y: 34, width: 175, height: 35, size: 25, bold: true)
        pill(CGRect(x: 273, y: 32, width: 140, height: 36), color: ink.withAlphaComponent(0.07))
        text(card.pageMarker, x: 280, y: 39, width: 126, height: 28, size: 19, color: muted, center: true)
        text("THE TEA", x: 438, y: 41, width: 140, height: 26, size: 17, color: wine, bold: true)
        // These lines contain no text or reconstructable body pixels.
        for (index, width) in [520, 474, 500, 365].enumerated() {
            pill(CGRect(x: 28, y: 110 + index * 34, width: width, height: 15), color: ink.withAlphaComponent(0.065))
        }
        pill(CGRect(x: 95, y: 151, width: 410, height: 64), color: ink)
        lock(in: CGRect(x: 120, y: 171, width: 22, height: 25))
        text("Sealed for every reader", x: 154, y: 170, width: 328, height: 35, size: 23, color: paper, bold: true)
        text("Open Bookish to check your page", x: 28, y: 264, width: 544, height: 32, size: 22, color: muted)
    }
    private static let catalog: [String: String] = {
        guard let url = Bundle.main.url(forResource: "books", withExtension: "json", subdirectory: "public/data"),
              let bytes = try? Data(contentsOf: url),
              let rows = try? JSONSerialization.jsonObject(with: bytes) as? [[String: Any]] else { return [:] }
        var titles: [String: String] = [:]
        for row in rows {
            if let id = row["id"] as? String, let title = row["t"] as? String { titles[id] = title }
        }
        return titles
    }()
    private static func vote(_ card: ServerMessageCard) {
        pink.withAlphaComponent(0.24).setFill(); UIBezierPath(rect: CGRect(x: 0, y: 0, width: 600, height: 124)).fill()
        text("OUR NEXT READ", x: 28, y: 23, width: 544, height: 28, size: 19, color: wine, bold: true)
        text("Pick the next book.", x: 28, y: 62, width: 544, height: 53, size: 36, serif: true)
        let total = max(1, card.options.reduce(0) { $0 + $1.ballots })
        for (index, option) in card.options.enumerated() {
            let y = CGFloat(145 + index * 85)
            let title = catalog[option.bookID] ?? "Book option \(index + 1)"
            var textX: CGFloat = 28
            // A catalog match prevents an untrusted identifier from selecting any other local file.
            if catalog[option.bookID] != nil,
               option.bookID.range(of: "^[a-z0-9-]+$", options: .regularExpression) != nil,
               let url = Bundle.main.url(forResource: option.bookID, withExtension: "jpg", subdirectory: "public/covers"),
               let cover = UIImage(contentsOfFile: url.path) {
                cover.draw(in: CGRect(x: 28, y: y - 4, width: 44, height: 68))
                textX = 91
            }
            text(title, x: textX, y: y, width: 490 - textX, height: 37, size: 25, serif: true)
            let width = CGFloat(option.ballots) / CGFloat(total) * (475 - textX)
            if width > 0 { pill(CGRect(x: textX, y: y + 43, width: max(12, width), height: 14), color: index == 0 ? butter : pink) }
            text("\(option.ballots)", x: 503, y: y + 10, width: 68, height: 32, size: 24, color: wine, bold: true, center: true)
        }
        text("\(card.status == "open" ? "Voting closes" : "Vote closed") \(formattedDate(card.closesAt))", x: 28, y: 466, width: 544, height: 30, size: 20, color: muted)
    }
    private static func meeting(_ card: ServerMessageCard) {
        let date = card.startsAt.flatMap(ServerMessageCard.date)
        let calendar = Calendar.current
        pill(CGRect(x: 28, y: 28, width: 112, height: 130), color: cream)
        wine.setFill(); UIBezierPath(rect: CGRect(x: 28, y: 28, width: 112, height: 34)).fill()
        let month = DateFormatter(); month.dateFormat = "MMM"
        text(date.map { month.string(from: $0).uppercased() } ?? "CLUB", x: 36, y: 35, width: 96, height: 27, size: 18, color: paper, bold: true, center: true)
        text(date.map { String(calendar.component(.day, from: $0)) } ?? "", x: 35, y: 78, width: 98, height: 67, size: 43, color: wine, bold: true, center: true)
        text("CLUB NIGHT", x: 164, y: 29, width: 408, height: 30, size: 19, color: wine, bold: true)
        text(card.title, x: 164, y: 70, width: 408, height: 94, size: 34, serif: true)
        text(formattedDate(card.startsAt), x: 28, y: 185, width: 544, height: 35, size: 24, color: muted)
        for (index, pair) in [("Going", card.counts?.yes ?? 0), ("Maybe", card.counts?.maybe ?? 0), ("Can't", card.counts?.cant ?? 0)].enumerated() {
            let rect = CGRect(x: 28 + index * 186, y: 242, width: 172, height: 64)
            pill(rect, color: index == 0 ? green : cream)
            text("\(pair.0) · \(pair.1)", x: rect.minX + 5, y: rect.minY + 19, width: 162, height: 35, size: 22, color: index == 0 ? paper : ink, bold: true, center: true)
        }
        text(card.openItems.first.map { "Bring list: \($0.label) still open" } ?? "A place to gather and talk books.", x: 28, y: 331, width: 544, height: 35, size: 23, color: muted)
    }
    private static func formattedDate(_ raw: String?) -> String {
        guard let raw = raw, let date = ServerMessageCard.date(raw) else { return "" }
        let formatter = DateFormatter(); formatter.dateStyle = .medium; formatter.timeStyle = .short
        return formatter.string(from: date)
    }
    private static func lock(in rect: CGRect) {
        let path = UIBezierPath(roundedRect: CGRect(x: rect.minX, y: rect.minY + 10, width: rect.width, height: 15), cornerRadius: 3)
        paper.setFill(); path.fill()
        let shackle = UIBezierPath(roundedRect: CGRect(x: rect.minX + 5, y: rect.minY, width: 12, height: 18), cornerRadius: 6)
        shackle.lineWidth = 3; paper.setStroke(); shackle.stroke()
    }
    private static func pill(_ rect: CGRect, color: UIColor) {
        color.setFill(); UIBezierPath(roundedRect: rect, cornerRadius: min(16, rect.height / 2)).fill()
    }
    private static func text(_ value: String, x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, size: CGFloat,
                             color: UIColor = ink, bold: Bool = false, serif: Bool = false, center: Bool = false) {
        var font = UIFont(name: serif ? "YoungSerif-Regular" : bold ? "Manrope-ExtraBold" : "Manrope-SemiBold", size: size)
            ?? (serif ? UIFont(descriptor: UIFont.systemFont(ofSize: size).fontDescriptor.withDesign(.serif)!, size: size) : UIFont.systemFont(ofSize: size, weight: bold ? .bold : .medium))
        let p = NSMutableParagraphStyle(); p.lineBreakMode = .byTruncatingTail; p.alignment = center ? .center : .left
        while font.pointSize > 18 && (value as NSString).size(withAttributes: [.font: font]).width > width {
            font = font.withSize(font.pointSize - 1)
        }
        (value as NSString).draw(with: CGRect(x: x, y: y, width: width, height: height),
                                options: [.usesLineFragmentOrigin, .usesFontLeading],
                                attributes: [.font: font, .foregroundColor: color, .paragraphStyle: p], context: nil)
    }
}
