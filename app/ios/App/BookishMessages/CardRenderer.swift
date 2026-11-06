import UIKit

/// Native v3 art uses the image region's 4:3 aspect, keeping all text inside its safe area.
/// The app name belongs to Messages' caption row, so an icon cannot obscure a wordmark.
enum CardRenderer {
    static func summary(_ state: MessageState) -> String {
        switch state.kind {
        case .rsvp:
            return "\(state.responses.filter { $0.rsvp == .yes }.count) in, \(state.responses.filter { $0.rsvp == .maybe }.count) maybe"
        case .vote: return "\(state.responses.filter { $0.voteID != nil }.count) votes shared"
        case .bookmarks: return "\(state.responses.filter { $0.page != nil }.count) readers sharing their page"
        }
    }
    static func image(for state: MessageState) -> UIImage {
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: 600, height: 450), format: format).image { _ in
            BookishTheme.card.setFill(); UIBezierPath(rect: CGRect(x: 0, y: 0, width: 600, height: 450)).fill()
            header(title: state.kind == .rsvp ? state.meetingTitle : state.kind == .bookmarks ? "Who's sharing their page?" : "Next book vote",
                   eyebrow: state.kind == .rsvp ? (BookishTheme.meetingDay(state) ?? "CLUB NIGHT") : state.readingTitle.uppercased(),
                   detail: state.kind == .rsvp ? state.meetingDetail : "", kind: state.kind)
            switch state.kind {
            case .rsvp:
                text("Are you coming?", CGRect(x: 28, y: 233, width: 544, height: 48), size: 35, serif: true)
                for (i, label) in ["I'm in", "Maybe", "Can't"].enumerated() {
                    let rect = CGRect(x: 28 + i * 175, y: 292, width: 160, height: 65)
                    pill(rect, fill: i == 0 ? BookishTheme.green : BookishTheme.card, border: i != 0)
                    text(label, rect.insetBy(dx: 8, dy: 17), size: 25, bold: true, color: i == 0 ? BookishTheme.card : BookishTheme.ink, center: true)
                }
                avatars(state.responses.map { $0.name }, y: 388)
                text(summary(state), CGRect(x: 216, y: 391, width: 360, height: 35), size: 23, color: BookishTheme.muted)
            case .bookmarks:
                let members = state.responses.filter { $0.page != nil }
                for (i, member) in members.prefix(3).enumerated() {
                    bookmark(member, x: CGFloat(58 + i * 105), color: [BookishTheme.hex(0xB8A2DA), BookishTheme.pink, BookishTheme.hex(0x9EC9B1)][i])
                }
                text(members.isEmpty ? "Log your page to find your people." : members.prefix(3).map { $0.name }.joined(separator: ", ") + " are reading", CGRect(x: 28, y: 329, width: 544, height: 38), size: 25, bold: true)
                text("Only people who share their page show up.", CGRect(x: 28, y: 370, width: 544, height: 30), size: 20, color: BookishTheme.muted)
                text("Log my page                         Open The Tea", CGRect(x: 28, y: 409, width: 544, height: 33), size: 23, bold: true, color: BookishTheme.green)
            case .vote:
                for (i, book) in state.candidates.prefix(3).enumerated() {
                    let x = CGFloat(28 + i * 190)
                    BookishTheme.cover(for: book)?.draw(in: CGRect(x: x + 45, y: 232, width: 80, height: 112))
                    text(book.title, CGRect(x: x, y: 351, width: 170, height: 56), size: 24, bold: true, center: true)
                }
                text(summary(state), CGRect(x: 28, y: 414, width: 544, height: 30), size: 21, color: BookishTheme.muted, center: true)
            }
        }
    }
    static func header(title: String, eyebrow: String, detail: String, kind: CardKind) {
        UIImage(named: "BookishOxblood")?.draw(in: CGRect(x: 0, y: 0, width: 600, height: 220))
        let note = CGRect(x: 28, y: 26, width: 385, height: 174)
        let context = UIGraphicsGetCurrentContext()!
        context.saveGState(); context.translateBy(x: note.midX, y: note.midY); context.rotate(by: -0.035)
        context.translateBy(x: -note.midX, y: -note.midY)
        BookishTheme.hex(0xF5E3AD).setFill(); UIBezierPath(roundedRect: note, cornerRadius: 9).fill()
        UIImage(named: "BookishPaper")?.draw(in: note, blendMode: .multiply, alpha: 0.35)
        text(eyebrow, CGRect(x: 49, y: 44, width: 340, height: 31), size: 22, bold: true, color: BookishTheme.wine)
        text(title, CGRect(x: 49, y: 82, width: 340, height: detail.isEmpty ? 105 : 63), size: 36, serif: true)
        if !detail.isEmpty { text(detail, CGRect(x: 49, y: 153, width: 320, height: 37), size: 22) }
        context.restoreGState()
        context.saveGState(); context.clip(to: CGRect(x: 0, y: 0, width: 600, height: 220))
        let art = BookishTheme.art(for: kind)
        let width: CGFloat = 300
        let height = width * art.size.height / max(1, art.size.width)
        art.draw(in: CGRect(x: 600 - width + 19, y: 21, width: width, height: height))
        context.restoreGState()
    }
    private static func bookmark(_ member: MemberResponse, x: CGFloat, color: UIColor) {
        let rect = CGRect(x: x, y: 220, width: 50, height: 91)
        let p = UIBezierPath(); p.move(to: rect.origin); p.addLine(to: CGPoint(x: rect.maxX,y: rect.minY)); p.addLine(to: CGPoint(x:rect.maxX,y:rect.maxY)); p.addLine(to: CGPoint(x:rect.midX,y:rect.maxY-17)); p.addLine(to: CGPoint(x:rect.minX,y:rect.maxY)); p.close()
        color.setFill(); p.fill(); BookishTheme.ink.setStroke(); p.lineWidth = 3; p.stroke()
        text(String(member.name.prefix(1)), rect.insetBy(dx: 4, dy: 35), size: 24, bold: true, center: true)
        text("p. \(member.page ?? 0)", CGRect(x:x-18,y:314,width:86,height:29), size:20, color:BookishTheme.muted, center:true)
    }
    private static func avatars(_ names: [String], y: CGFloat) {
        for (i, name) in names.prefix(4).enumerated() {
            let r = CGRect(x: 28 + i*39, y: Int(y), width: 45, height: 45)
            [BookishTheme.butter, BookishTheme.hex(0x9DD0B4), BookishTheme.pink, BookishTheme.hex(0xC8AFE6)][i].setFill()
            UIBezierPath(ovalIn: r).fill(); BookishTheme.card.setStroke(); let p = UIBezierPath(ovalIn:r);p.lineWidth=3;p.stroke()
            text(String(name.prefix(1)),r.insetBy(dx:0,dy:10),size:20,bold:true,center:true)
        }
    }
    static func pill(_ rect: CGRect, fill: UIColor, border: Bool = false) {
        let p = UIBezierPath(roundedRect: rect, cornerRadius: rect.height/2); fill.setFill();p.fill()
        if border { BookishTheme.line.setStroke();p.lineWidth=2;p.stroke() }
    }
    static func text(_ value: String, _ rect: CGRect, size: CGFloat, serif: Bool = false, bold: Bool = false, color: UIColor = BookishTheme.ink, center: Bool = false) {
        let p = NSMutableParagraphStyle();p.lineBreakMode = .byWordWrapping;p.alignment = center ? .center : .left
        var font = BookishTheme.font(serif ? .title : bold ? .button : .body, scalable:false).withSize(size)
        while font.pointSize > 16 && (value as NSString).boundingRect(with: CGSize(width:rect.width,height:.greatestFiniteMagnitude),options:[.usesLineFragmentOrigin,.usesFontLeading],attributes:[.font:font,.paragraphStyle:p],context:nil).height > rect.height { font=font.withSize(font.pointSize-1) }
        (value as NSString).draw(in:rect,withAttributes:[.font:font,.foregroundColor:color,.paragraphStyle:p])
    }
}
