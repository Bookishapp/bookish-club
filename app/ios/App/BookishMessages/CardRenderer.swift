import UIKit

/// Transcript art is a snapshot. Messages opens the editor when the card is tapped.
enum CardRenderer {
    static func summary(_ state: MessageState) -> String {
        switch state.kind {
        case .rsvp:
            let yes = state.responses.filter { $0.rsvp == .yes }.count
            let maybe = state.responses.filter { $0.rsvp == .maybe }.count
            let cant = state.responses.filter { $0.rsvp == .cant }.count
            return "\(yes) yes, \(maybe) maybe, and \(cant) can't"
        case .vote: return "\(state.responses.filter { $0.voteID != nil }.count) votes shared"
        case .bookmarks: return "\(state.responses.filter { $0.page != nil }.count) bookmarks on our shelf"
        }
    }

    static func image(for state: MessageState) -> UIImage {
        let bookmarkHeight: CGFloat = state.responses.filter { $0.page != nil }.count > 4 ? 600 : 500
        let size = CGSize(width: 600, height: state.kind == .vote ? 570 : state.kind == .bookmarks ? bookmarkHeight : 520)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            let bounds = CGRect(origin: .zero, size: size)
            BookishTheme.card.setFill(); UIBezierPath(rect: bounds).fill()
            if state.kind == .bookmarks { bookmarks(state, size: size, context: context.cgContext) }
            else if state.kind == .vote { vote(state, size: size) }
            else { rsvp(state, size: size) }
        }
    }

    private static func rsvp(_ state: MessageState, size: CGSize) {
        // The approved calendar block uses available meeting facts. No date is stored in v1 URLs.
        let calendar = CGRect(x: 28, y: 28, width: 112, height: 158)
        BookishTheme.card.setFill(); UIBezierPath(roundedRect: calendar, cornerRadius: 14).fill()
        BookishTheme.line.setStroke(); let outline = UIBezierPath(roundedRect: calendar, cornerRadius: 14)
        outline.lineWidth = 2; outline.stroke()
        BookishTheme.wine.setFill()
        UIBezierPath(roundedRect: CGRect(x: 28, y: 28, width: 112, height: 38), cornerRadius: 12).fill()
        UIBezierPath(rect: CGRect(x: 28, y: 48, width: 112, height: 18)).fill()
        draw("CLUB", in: CGRect(x: 35, y: 34, width: 98, height: 27), style: .caption,
             color: BookishTheme.card, alignment: .center, tracking: 2)
        draw(BookishTheme.meetingDay(state) ?? "MEET", in: CGRect(x: 35, y: 89, width: 98, height: 49),
             style: BookishTheme.meetingDay(state) == nil ? .caption : .title, color: BookishTheme.wine, alignment: .center)
        draw("NIGHT", in: CGRect(x: 35, y: 150, width: 98, height: 27), style: .caption,
             color: BookishTheme.muted, alignment: .center, tracking: 2)
        draw("CLUB NIGHT", in: CGRect(x: 164, y: 30, width: 408, height: 27), style: .caption,
             color: BookishTheme.wine, tracking: 3)
        draw(state.readingTitle, in: CGRect(x: 164, y: 76, width: 408, height: 93), style: .title)
        draw(state.meetingTitle, in: CGRect(x: 28, y: 210, width: 544, height: 59), style: .heading)
        draw(state.meetingDetail, in: CGRect(x: 28, y: 278, width: 544, height: 58), style: .body,
             color: BookishTheme.muted)
        let counts = [state.responses.filter { $0.rsvp == .yes }.count,
                      state.responses.filter { $0.rsvp == .maybe }.count,
                      state.responses.filter { $0.rsvp == .cant }.count]
        for (index, title) in ["Going", "Maybe", "Can't"].enumerated() {
            let rect = CGRect(x: CGFloat(28 + index * 186), y: 348, width: 172, height: 76)
            pill(rect, color: index == 0 ? BookishTheme.green : BookishTheme.cream)
            draw("\(title) · \(counts[index])", in: rect.insetBy(dx: 6, dy: 23), style: .button,
                 color: index == 0 ? BookishTheme.card : BookishTheme.ink, alignment: .center)
        }
        footer(state.clubName, action: "Are you coming? Tap to RSVP", top: 440, height: size.height - 440)
    }

    private static func vote(_ state: MessageState, size: CGSize) {
        BookishTheme.lilac.withAlphaComponent(0.55).setFill()
        UIBezierPath(rect: CGRect(x: 0, y: 0, width: size.width, height: 132)).fill()
        draw("OUR NEXT READ", in: CGRect(x: 28, y: 24, width: 420, height: 28), style: .caption,
             color: BookishTheme.wine, tracking: 3)
        draw("Pick the next book.", in: CGRect(x: 28, y: 64, width: 544, height: 52), style: .title)
        let total = state.responses.filter { $0.voteID != nil }.count
        for (index, book) in state.candidates.enumerated() {
            let y = CGFloat(146 + index * 112)
            let count = state.responses.filter { $0.voteID == book.id }.count
            let cover = BookishTheme.cover(for: book)
            if let cover = cover { cover.drawAspectFit(in: CGRect(x: 28, y: y, width: 60, height: 92)) }
            let textX: CGFloat = cover == nil ? 28 : 110
            draw(book.title, in: CGRect(x: textX, y: y, width: 420 - textX + 28, height: 45), style: .heading)
            draw(book.author, in: CGRect(x: textX, y: y + 44, width: 420, height: 29), style: .caption,
                 color: BookishTheme.muted)
            BookishTheme.selectionMark(selected: false).draw(in: CGRect(x: 536, y: y + 24, width: 36, height: 36))
            let ribbonWidth = total == 0 ? 0 : CGFloat(count) / CGFloat(total) * 300
            if ribbonWidth > 0 {
                ribbon(CGRect(x: textX, y: y + 83, width: max(14, ribbonWidth), height: 16),
                       color: index == 0 ? BookishTheme.butter : BookishTheme.pink)
            }
            draw(String(count), in: CGRect(x: textX + max(14, ribbonWidth) + 15, y: y + 73, width: 50, height: 32),
                 style: .button, color: BookishTheme.wine)
            BookishTheme.line.setFill()
            UIBezierPath(rect: CGRect(x: 28, y: y + 106, width: 544, height: 1)).fill()
        }
        footer(summary(state) + " · " + state.clubName, action: "Tap to choose a book", top: 484, height: size.height - 484)
    }

    private static func bookmarks(_ state: MessageState, size: CGSize, context: CGContext) {
        BookishTheme.deepGreen.setFill(); UIBezierPath(rect: CGRect(origin: .zero, size: size)).fill()
        // The same subtle diagonal paper grain as the approved v2 communal shelf.
        context.saveGState()
        context.setStrokeColor(BookishTheme.card.withAlphaComponent(0.025).cgColor)
        context.setLineWidth(3)
        for x in stride(from: -520, through: 650, by: 14) {
            context.move(to: CGPoint(x: x, y: 0)); context.addLine(to: CGPoint(x: x + 300, y: 520))
        }
        context.strokePath(); context.restoreGState()
        draw("READING TOGETHER", in: CGRect(x: 28, y: 25, width: 420, height: 27), style: .caption,
             color: BookishTheme.butter, tracking: 3)
        draw(state.readingTitle, in: CGRect(x: 28, y: 67, width: 544, height: 89), style: .title,
             color: BookishTheme.card)
        let members = state.responses.filter { $0.page != nil }
        if members.isEmpty {
            draw("A place for every bookmark.", in: CGRect(x: 28, y: 211, width: 544, height: 90),
                 style: .heading, color: BookishTheme.card)
        } else {
            // Preserve the shared member order. Never sort readers by their page.
            for (index, member) in members.prefix(6).enumerated() {
                let y = CGFloat(169 + index * 49)
                draw(member.name, in: CGRect(x: 28, y: y, width: 150, height: 34), style: .body,
                     color: BookishTheme.mint)
                let width = CGFloat(member.page ?? 0) / CGFloat(max(1, state.totalPages)) * 266
                if width > 0 { ribbon(CGRect(x: 190, y: y + 6, width: max(12, width), height: 23), color: BookishTheme.pink) }
                draw(member.page == state.totalPages ? "Done" : "\(member.page ?? 0)", in: CGRect(x: 466, y: y, width: 106, height: 35), style: .button,
                     color: BookishTheme.card, alignment: .right)
            }
            if members.count > 6 {
                draw("And \(members.count - 6) more on our shared shelf", in: CGRect(x: 28, y: 475, width: 544, height: 30),
                     style: .caption, color: BookishTheme.mint)
            }
        }
        draw("Read at your own pace.", in: CGRect(x: 28, y: size.height - 81, width: 544, height: 30), style: .caption,
             color: BookishTheme.mint)
        draw("Tap to add your bookmark", in: CGRect(x: 28, y: size.height - 41, width: 544, height: 29), style: .caption,
             color: BookishTheme.butter)
    }

    private static func footer(_ detail: String, action: String, top: CGFloat, height: CGFloat) {
        BookishTheme.cream.setFill()
        UIBezierPath(rect: CGRect(x: 0, y: top, width: 600, height: height)).fill()
        draw(action, in: CGRect(x: 28, y: top + 11, width: 544, height: 32), style: .button)
        draw(detail, in: CGRect(x: 28, y: top + 47, width: 544, height: 29), style: .caption, color: BookishTheme.muted)
    }
    private static func pill(_ rect: CGRect, color: UIColor) {
        color.setFill(); UIBezierPath(roundedRect: rect, cornerRadius: rect.height / 2).fill()
    }
    private static func ribbon(_ rect: CGRect, color: UIColor) {
        color.setFill()
        let path = UIBezierPath(); path.move(to: rect.origin)
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: max(rect.minX, rect.maxX - 10), y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY)); path.close(); path.fill()
    }
    private static func draw(_ text: String, in rect: CGRect, style: BookishTheme.TypeStyle,
                             color: UIColor = BookishTheme.ink, alignment: NSTextAlignment = .left,
                             tracking: CGFloat = 0) {
        let paragraph = NSMutableParagraphStyle()
        switch style {
        case .title, .heading, .body: paragraph.lineBreakMode = .byWordWrapping
        case .caption, .button: paragraph.lineBreakMode = .byTruncatingTail
        }
        paragraph.alignment = alignment
        var font = BookishTheme.transcriptFont(style)
        // Long working titles wrap, and shrink within a bounded range before truncating.
        while font.pointSize > 18 {
            let height = (text as NSString).boundingRect(with: CGSize(width: rect.width, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font, .paragraphStyle: paragraph], context: nil).height
            if height <= rect.height { break }; font = font.withSize(font.pointSize - 1)
        }
        (text as NSString).draw(in: rect, withAttributes: [.font: font, .foregroundColor: color,
            .paragraphStyle: paragraph, .kern: tracking])
    }
}

private extension UIImage {
    func drawAspectFit(in rect: CGRect) {
        guard size.width > 0, size.height > 0 else { return }
        let scale = min(rect.width / size.width, rect.height / size.height)
        let fitted = CGSize(width: size.width * scale, height: size.height * scale)
        draw(in: CGRect(x: rect.midX - fitted.width / 2, y: rect.midY - fitted.height / 2,
                        width: fitted.width, height: fitted.height))
    }
}
