import UIKit

/// Transcript art has no pretend controls. Tapping the card opens the native editor.
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
        let size = CGSize(width: 600, height: 500)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            BookishTheme.cream.setFill(); UIBezierPath(rect: CGRect(origin: .zero, size: size)).fill()
            BookishTheme.accent(for: state.kind).setFill()
            UIBezierPath(roundedRect: CGRect(x: 24, y: 20, width: 552, height: 130), cornerRadius: 24).fill()
            BookishTheme.art(for: state.kind).draw(in: CGRect(x: 378, y: 25, width: 180, height: 108))
            draw("BOOKISH", x: 44, y: 38, width: 320, style: .caption)
            draw(BookishTheme.title(for: state.kind), x: 44, y: 69, width: 330, height: 64, style: .title)
            draw(state.clubName, x: 38, y: 168, width: 524, style: .caption)
            switch state.kind {
            case .rsvp:
                draw(state.meetingTitle, x: 38, y: 201, width: 524, style: .heading)
                draw(state.meetingDetail, x: 38, y: 245, width: 524, height: 62, style: .body)
                draw(state.readingTitle, x: 38, y: 315, width: 524, height: 55, style: .body)
                draw(summary(state), x: 38, y: 376, width: 524, style: .heading)
            case .vote:
                for (index, book) in state.candidates.enumerated() {
                    let y = CGFloat(206 + index * 69)
                    let count = state.responses.filter { $0.voteID == book.id }.count
                    draw("\(book.title) · \(count)", x: 38, y: y, width: 524, style: .heading)
                    draw(book.author, x: 38, y: y + 29, width: 524, style: .caption)
                }
            case .bookmarks:
                draw(state.readingTitle, x: 38, y: 201, width: 524, height: 50, style: .heading)
                let bookmarks = state.responses.filter { $0.page != nil }
                if bookmarks.isEmpty {
                    draw("A place for every bookmark.", x: 38, y: 275, width: 524, style: .body)
                    draw("Read at your own pace.", x: 38, y: 314, width: 524, style: .body)
                } else {
                    for (index, member) in bookmarks.prefix(4).enumerated() {
                        draw("\(member.name): page \(member.page ?? 0)", x: 38,
                             y: CGFloat(264 + index * 35), width: 524, style: .body)
                    }
                    if bookmarks.count > 4 {
                        draw("And \(bookmarks.count - 4) more on our shared shelf", x: 38, y: 410,
                             width: 524, style: .caption)
                    }
                }
            }
            draw(state.kind == .rsvp ? "Tap to RSVP" : state.kind == .vote ? "Tap to choose a book" : "Tap to add your bookmark",
                 x: 38, y: 457, width: 524, style: .caption)
        }
    }

    private static func draw(_ text: String, x: CGFloat, y: CGFloat, width: CGFloat,
                             height: CGFloat = 40, style: BookishTheme.TypeStyle) {
        let paragraph = NSMutableParagraphStyle(); paragraph.lineBreakMode = .byTruncatingTail
        (text as NSString).draw(in: CGRect(x: x, y: y, width: width, height: height), withAttributes: [
            .font: BookishTheme.transcriptFont(style), .foregroundColor: BookishTheme.wine,
            .paragraphStyle: paragraph
        ])
    }
}
