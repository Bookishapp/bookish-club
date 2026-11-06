import SwiftUI
import WidgetKit

struct BookishEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}
struct BookishProvider: TimelineProvider {
    func placeholder(in context: Context) -> BookishEntry { BookishEntry(date: Date(), snapshot: nil) }
    func getSnapshot(in context: Context, completion: @escaping (BookishEntry) -> Void) { completion(BookishEntry(date: Date(), snapshot: WidgetSnapshotStore.read())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<BookishEntry>) -> Void) {
        let snapshot = WidgetSnapshotStore.read()
        completion(Timeline(entries: [BookishEntry(date: Date(), snapshot: snapshot)], policy: .after(Date().addingTimeInterval(900))))
    }
}

enum BookishWidgetStyle: String { case reading, meeting, tea }

/// The same SwiftUI surface is used by WidgetKit and the simulator review host.
struct BookishWidgetView: View {
    let snapshot: WidgetSnapshot?
    let style: BookishWidgetStyle
    private let green = Color(red: 0.114, green: 0.353, blue: 0.275)
    private let paper = Color(red: 0.98, green: 0.92, blue: 0.78)
    private let wine = Color(red: 0.478, green: 0.102, blue: 0.165)
    private let yellow = Color(red: 0.98, green: 0.85, blue: 0.40)
    private func serif(_ size: CGFloat) -> Font { _ = BookishTheme.font(.title, scalable: false); return .custom("YoungSerif-Regular", size: size) }
    private func sans(_ size: CGFloat) -> Font { _ = BookishTheme.font(.body, scalable: false); return .custom("Manrope-SemiBold", size: size) }
    var body: some View {
        GeometryReader { geometry in
        ZStack(alignment: .topLeading) {
            if style == .reading { green } else { paper.overlay(Image("BookishPaper").resizable().opacity(0.20)) }
            if let snapshot = snapshot {
                switch style {
                case .reading: reading(snapshot)
                case .meeting: meeting(snapshot)
                case .tea: tea(snapshot)
                }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Bookish").font(serif(23))
                    Text("Open Bookish to choose your club.").font(sans(13))
                }.padding(16).foregroundStyle(style == .reading ? paper : Color.black)
            }
        }
        .frame(width: geometry.size.width, height: geometry.size.height)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: style == .reading ? 24 : 26))
        .widgetURL(URL(string: style == .reading ? "bookish://widget/read" : style == .meeting ? "bookish://widget/meeting" : "bookish://widget/tea"))
        .accessibilityElement(children: .combine)
        }
    }
    private func reading(_ s: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                ZStack(alignment: .topLeading) {
                    Color(red: 0.95, green: 0.62, blue: 0.73)
                    Text(s.readingTitle).font(serif(9)).padding(5).foregroundStyle(.black)
                    BookishHeart().stroke(.black, style: StrokeStyle(lineWidth: 1, lineCap: .round, lineJoin: .round)).frame(width: 19, height: 19).offset(x: 17, y: 54).accessibilityHidden(true)
                }.frame(width: 52, height: 78).clipShape(RoundedRectangle(cornerRadius: 5))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Reading together").font(sans(11))
                    Text("You're on p. \(s.page)").font(serif(20)).lineLimit(1).fixedSize(horizontal: true, vertical: false)
                    Text(s.remainingPages.map { "\($0) pages to " + (s.stopLabel ?? "your next stop") } ?? "Read at your own pace.").font(sans(11))
                }.padding(.top, 14)
                Spacer(minLength: 0)
            }
            .overlay(alignment: .trailing) {
                Link(destination: URL(string: "bookish://widget/log")!) { Text("+ Log").font(sans(11)).foregroundStyle(.black).padding(.horizontal, 10).padding(.vertical, 5).background(yellow, in: Capsule()) }
            }
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.22))
                    Capsule().fill(yellow).frame(width: geometry.size.width * CGFloat(s.page) / CGFloat(max(1,s.totalPages)))
                    if let stop = s.stopPage {
                        Rectangle().fill(paper).frame(width: 2, height: 19).offset(x: geometry.size.width * CGFloat(stop) / CGFloat(max(1,s.totalPages)))
                    }
                }
            }.frame(height: 10)
            Text("\(s.friendsReading) friends sharing bookmarks").font(sans(11))
        }.foregroundStyle(paper).padding(16)
    }
    private func meeting(_ s: WidgetSnapshot) -> some View {
        ZStack(alignment: .bottomTrailing) {
            VStack(alignment: .leading, spacing: 6) {
                Text(s.meetingDay ?? "Club night").font(sans(11)).foregroundStyle(wine)
                Text(s.meetingTitle ?? "Plan your next club night").font(serif(21)).lineLimit(3).minimumScaleFactor(0.65)
                if let detail = s.meetingDetail { Text(detail).font(sans(11)).foregroundStyle(.black.opacity(0.65)) }
                Spacer(minLength: 0)
                if s.going { HStack(spacing: 5) { BookishTick().stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round)).frame(width: 12, height: 12).accessibilityHidden(true); Text("Going") }.font(sans(11)).padding(.horizontal, 10).padding(.vertical, 4).foregroundStyle(.white).background(green,in:Capsule()) }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(14)
            Image("LunairRSVP").resizable().scaledToFit().frame(width: 100, height: 120).offset(x: 20,y: 37).accessibilityHidden(true)
        }
    }
    private func tea(_ s: WidgetSnapshot) -> some View {
        ZStack(alignment: .bottomTrailing) {
            VStack(alignment: .leading, spacing: 6) {
                Text("The Tea").font(sans(11)).foregroundStyle(wine)
                Text("\(s.newTakes) new takes" + (s.chapter.map { "\non ch. \($0)" } ?? "")).font(serif(20)).lineLimit(3).minimumScaleFactor(0.7)
                Text("\(s.sealedTakes) sealed\npast your page").font(sans(10)).lineLimit(2).foregroundStyle(.black.opacity(0.65))
                Spacer(minLength: 0)
            }.frame(maxWidth:.infinity,alignment:.leading).padding(14)
            Image("TeaCup").resizable().scaledToFit().frame(width:53,height:53).padding(11).accessibilityHidden(true)
        }
    }
}

struct BookishHeart: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.height * 0.93))
        p.addCurve(to: CGPoint(x: rect.midX, y: rect.height * 0.23), control1: CGPoint(x: -rect.width * 0.47, y: rect.height * 0.29), control2: CGPoint(x: rect.width * 0.06, y: -rect.height * 0.27))
        p.addCurve(to: CGPoint(x: rect.midX, y: rect.height * 0.93), control1: CGPoint(x: rect.width * 0.94, y: -rect.height * 0.27), control2: CGPoint(x: rect.width * 1.47, y: rect.height * 0.29))
        p.closeSubpath(); return p
    }
}
struct BookishTick: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path(); p.move(to: CGPoint(x: rect.width * 0.08, y: rect.height * 0.52))
        p.addLine(to: CGPoint(x: rect.width * 0.37, y: rect.height * 0.82)); p.addLine(to: CGPoint(x: rect.width * 0.94, y: rect.height * 0.12)); return p
    }
}

struct BookishConfiguredWidget: Widget {
    let style: BookishWidgetStyle
    init() { style = .reading }
    init(style: BookishWidgetStyle) { self.style = style }
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "Bookish." + style.rawValue, provider: BookishProvider()) { entry in
            if #available(iOS 17.0, *) {
                BookishWidgetView(snapshot: entry.snapshot, style: style).containerBackground(.clear, for: .widget)
            } else { BookishWidgetView(snapshot: entry.snapshot, style: style) }
        }
        .configurationDisplayName(style == .reading ? "Reading together" : style == .meeting ? "Club night" : "The Tea")
        .description(style == .reading ? "Your page, your reading stop, and friends sharing bookmarks." : style == .meeting ? "Your next meeting and RSVP." : "Fresh take counts. Spoilers stay sealed.")
        .supportedFamilies(style == .reading ? [.systemMedium] : [.systemSmall])
        .contentMarginsDisabled()
    }
}

#if !BOOKISH_PARITY
@main
struct BookishWidgets: WidgetBundle {
    var body: some Widget {
        BookishConfiguredWidget(style: .reading)
        BookishConfiguredWidget(style: .meeting)
        BookishConfiguredWidget(style: .tea)
    }
}
#endif
