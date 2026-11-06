import Foundation

/// A resource route grants no access. The app must sign in and fetch fresh data.
struct MessageResource: Equatable {
    enum Kind: String, Codable { case take, vote, meeting }
    let kind: Kind
    let id: UUID
    var url: URL { URL(string: "https://meetbookish.com/imessage/v2/\(kind.rawValue)/\(id.uuidString.lowercased())")! }
    var appURL: URL { URL(string: "bookish://message/\(kind.rawValue)/\(id.uuidString.lowercased())")! }

    static func decode(url: URL) throws -> MessageResource {
        guard url.absoluteString.utf8.count <= 200,
              let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              c.scheme == "https", c.host == "meetbookish.com", c.user == nil,
              c.password == nil, c.port == nil, c.query == nil, c.fragment == nil,
              c.percentEncodedPath == c.path else {
            throw ServerCardError.invalidCard
        }
        let parts = c.path.components(separatedBy: "/")
        guard parts.count == 5, parts[0].isEmpty, parts[1] == "imessage", parts[2] == "v2",
              let kind = Kind(rawValue: parts[3]), let id = UUID(uuidString: parts[4]),
              parts[4].lowercased() == id.uuidString.lowercased() else { throw ServerCardError.invalidCard }
        return MessageResource(kind: kind, id: id)
    }
}

enum ServerCardError: Error { case invalidCard }

/// Only fields required to draw a safe transcript image survive decoding.
/// No bearer session, feed body, author, ownership, location, or image URL is retained.
struct ServerMessageCard: Encodable {
    struct Book: Codable { let id: String; let title: String }
    struct Option: Codable {
        let optionID: UUID; let bookID: String; let ballots: Int
        enum CodingKeys: String, CodingKey { case optionID = "option_id", bookID = "book_id", ballots }
    }
    struct Counts: Codable { let yes: Int; let maybe: Int; let cant: Int }
    struct OpenItem: Codable { let id: UUID; let label: String }
    let kind: MessageResource.Kind
    let id: UUID
    let page: Int?
    let didNotFinish: Bool?
    let sealed: Bool?
    let book: Book?
    let status: String?
    let closesAt: String?
    let meetingTitle: String?
    let startsAt: String?
    let counts: Counts?
    let options: [Option]
    let openItems: [OpenItem]

    enum CodingKeys: String, CodingKey {
        case kind, id, page, sealed, book, status, counts, options
        case didNotFinish = "did_not_finish", closesAt = "closes_at", meetingTitle = "title"
        case startsAt = "starts_at", openItems = "open_items"
    }
    var resource: MessageResource { MessageResource(kind: kind, id: id) }
    var title: String { book?.title ?? meetingTitle ?? "Pick the next book." }
    var pageMarker: String { didNotFinish == true ? "DNF" : "p. \(page ?? 0)" }
    var summary: String {
        switch kind {
        case .take: return didNotFinish == true ? "Sealed. Finish the book to join the Tea." : "Sealed until your page allows. Open Bookish."
        case .vote: return "\(options.reduce(0) { $0 + $1.ballots }) votes shared. Open Bookish to vote."
        case .meeting: return "\(counts?.yes ?? 0) yes, \(counts?.maybe ?? 0) maybe, and \(counts?.cant ?? 0) can't."
        }
    }
    static func decode(data: Data) throws -> ServerMessageCard {
        guard data.count <= 65_536 else { throw ServerCardError.invalidCard }
        return try JSONDecoder().decode(ServerMessageCard.self, from: data)
    }
    static func date(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions.insert(.withFractionalSeconds)
        return formatter.date(from: value)
    }
    private static func text(_ value: String, maximum: Int = 160) throws {
        guard !value.isEmpty, value.utf8.count <= maximum,
              value == value.trimmingCharacters(in: .whitespacesAndNewlines),
              value.rangeOfCharacter(from: .controlCharacters) == nil else { throw ServerCardError.invalidCard }
    }
}

extension ServerMessageCard: Decodable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decode(MessageResource.Kind.self, forKey: .kind)
        id = try c.decode(UUID.self, forKey: .id)
        switch kind {
        case .take:
            page = try c.decodeIfPresent(Int.self, forKey: .page)
            didNotFinish = try c.decode(Bool.self, forKey: .didNotFinish)
            sealed = try c.decode(Bool.self, forKey: .sealed)
            guard sealed == true,
                  (didNotFinish == true && page == nil) || (didNotFinish == false && page != nil && (0...100_000).contains(page!)) else { throw ServerCardError.invalidCard }
            book = try c.decode(Book.self, forKey: .book)
            try Self.text(book!.title); try Self.text(book!.id, maximum: 160)
            status = nil; closesAt = nil; meetingTitle = nil; startsAt = nil; counts = nil; options = []; openItems = []
        case .vote:
            options = try c.decode([Option].self, forKey: .options)
            guard options.count <= 4, Set(options.map { $0.optionID }).count == options.count else { throw ServerCardError.invalidCard }
            for option in options {
                try Self.text(option.bookID)
                guard (0...1_000_000).contains(option.ballots) else { throw ServerCardError.invalidCard }
            }
            status = try c.decode(String.self, forKey: .status)
            closesAt = try c.decode(String.self, forKey: .closesAt)
            guard ["open", "closed"].contains(status!), Self.date(closesAt!) != nil else { throw ServerCardError.invalidCard }
            page = nil; didNotFinish = nil; sealed = nil; book = nil; meetingTitle = nil; startsAt = nil; counts = nil; openItems = []
        case .meeting:
            meetingTitle = try c.decode(String.self, forKey: .meetingTitle)
            try Self.text(meetingTitle!)
            startsAt = try c.decode(String.self, forKey: .startsAt)
            status = try c.decode(String.self, forKey: .status)
            guard Self.date(startsAt!) != nil, ["scheduled", "cancelled", "completed"].contains(status!) else { throw ServerCardError.invalidCard }
            counts = try c.decode(Counts.self, forKey: .counts)
            guard [counts!.yes, counts!.maybe, counts!.cant].allSatisfy({ (0...1_000_000).contains($0) }) else { throw ServerCardError.invalidCard }
            openItems = try c.decode([OpenItem].self, forKey: .openItems)
            guard openItems.count <= 100, Set(openItems.map { $0.id }).count == openItems.count else { throw ServerCardError.invalidCard }
            for item in openItems { try Self.text(item.label) }
            page = nil; didNotFinish = nil; sealed = nil; book = nil; closesAt = nil; options = []
        }
    }
}
