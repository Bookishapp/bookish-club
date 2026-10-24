import Foundation

enum CardKind: String, Codable, CaseIterable {
    case rsvp, vote, bookmarks
}

struct CandidateBook: Codable, Equatable {
    var id: String
    var title: String
    var author: String
    var reason: String
}

enum RSVPChoice: String, Codable, CaseIterable {
    case yes, maybe, cant
}

struct MemberResponse: Codable, Equatable {
    var participantID: String
    var name: String
    var rsvp: RSVPChoice?
    var voteID: String?
    var page: Int?
    var updatedAt: Date

    // Compact field names leave more of Messages' URL capacity for readers.
    private enum CodingKeys: String, CodingKey {
        case participantID = "p"
        case name = "n"
        case rsvp = "r"
        case voteID = "v"
        case page = "b"
        case updatedAt = "t"
    }
}

enum MessageStateError: Error, LocalizedError, Equatable {
    case invalidURL
    case unsupportedVersion
    case payloadTooLarge
    case invalidField(String)
    case invalidCandidates
    case invalidResponse
    case tooManyMembers

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "This Bookish card link is invalid."
        case .unsupportedVersion: return "This card uses an unsupported Bookish version."
        case .payloadTooLarge: return "This Bookish card is too large to open."
        case .invalidField(let field): return "Please check the card's \(field)."
        case .invalidCandidates: return "Choose two or three distinct books."
        case .invalidResponse: return "This response does not match the card."
        case .tooManyMembers: return "This card already has 40 readers."
        }
    }
}

/// A self-contained transcript snapshot. Its URL exposes shared names and
/// responses to message recipients. Base64 encoding does not encrypt this data.
struct MessageState: Codable, Equatable {
    var version: Int
    var cardID: UUID
    var kind: CardKind
    var clubName: String
    var meetingTitle: String
    var meetingDetail: String
    var readingTitle: String
    var totalPages: Int
    var candidates: [CandidateBook]
    var responses: [MemberResponse]

    static let maximumMembers = 40
    private static let maximumJSONBytes = 32_768
    private static let maximumURLBytes = 5_000

    private enum CodingKeys: String, CodingKey {
        case version, cardID, kind, clubName, meetingTitle, meetingDetail
        case readingTitle, totalPages, candidates, responses
    }

    static func sample(kind: CardKind) -> MessageState {
        return MessageState(
            version: 1,
            cardID: UUID(),
            kind: kind,
            clubName: "Sample Bookish club",
            meetingTitle: "Thursday at Jess's",
            meetingDetail: "7:30 PM, through chapter 30",
            readingTitle: "Pride and Prejudice",
            totalPages: 432,
            candidates: [
                CandidateBook(id: "pride", title: "Pride and Prejudice", author: "Jane Austen", reason: "Wit, first impressions, and a lively discussion."),
                CandidateBook(id: "frankenstein", title: "Frankenstein", author: "Mary Shelley", reason: "An absorbing story about ambition and responsibility."),
                CandidateBook(id: "jane-eyre", title: "Jane Eyre", author: "Charlotte Brontë", reason: "A determined voice, a mystery, and plenty to talk about.")
            ],
            responses: []
        )
    }

    func messageURL() throws -> URL {
        try validate()
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970
        encoder.outputFormatting = [.sortedKeys]
        var canonical = self
        canonical.responses.sort(by: Self.responseOrder)
        let data = try encoder.encode(canonical)
        guard data.count <= Self.maximumJSONBytes else { throw MessageStateError.payloadTooLarge }
        let payload = data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        var components = URLComponents()
        components.scheme = "https"
        components.host = "meetbookish.com"
        components.path = "/imessage/v1"
        // Fragments are not sent to the fallback web server in HTTP requests.
        components.fragment = "payload=" + payload
        guard let url = components.url else { throw MessageStateError.invalidURL }
        guard url.absoluteString.utf8.count <= Self.maximumURLBytes else { throw MessageStateError.payloadTooLarge }
        return url
    }

    static func decode(url: URL) throws -> MessageState {
        // Bound allocation before URL parsing, base64 decoding, or JSON decoding.
        guard url.absoluteString.utf8.count <= maximumURLBytes else { throw MessageStateError.payloadTooLarge }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            components.scheme == "https", components.host == "meetbookish.com",
            components.path == "/imessage/v1", components.user == nil,
            components.password == nil, components.port == nil,
            components.query == nil,
            let fragment = components.fragment, fragment.hasPrefix("payload=") else {
            throw MessageStateError.invalidURL
        }
        let payload = String(fragment.dropFirst("payload=".count))
        guard !payload.isEmpty, payload.utf8.count <= 43_691,
            payload.utf8.count % 4 != 1,
            payload.utf8.allSatisfy({ byte in
                (65...90).contains(byte) || (97...122).contains(byte) ||
                (48...57).contains(byte) || byte == 45 || byte == 95
            }) else { throw MessageStateError.invalidURL }

        var base64 = payload.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - base64.utf8.count % 4) % 4)
        guard let data = Data(base64Encoded: base64) else { throw MessageStateError.invalidURL }
        guard data.count <= maximumJSONBytes else { throw MessageStateError.payloadTooLarge }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        return try decoder.decode(MessageState.self, from: data)
    }

    mutating func respond(
        participantID: String,
        name: String,
        rsvp: RSVPChoice? = nil,
        voteID: String? = nil,
        page: Int? = nil,
        now: Date = Date()
    ) throws {
        try validate()
        // Work on a copy so an invalid response leaves the snapshot untouched.
        var updated = self
        let displayName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let position = updated.responses.firstIndex { $0.participantID == participantID }
        var response = position.map { updated.responses[$0] } ?? MemberResponse(
            participantID: participantID, name: "Reader", rsvp: nil,
            voteID: nil, page: nil, updatedAt: now
        )
        response.name = displayName.isEmpty ? "Reader" : displayName
        response.updatedAt = now
        if let rsvp = rsvp { response.rsvp = rsvp }
        if let voteID = voteID { response.voteID = voteID }
        if let page = page { response.page = page }
        if let position = position {
            updated.responses[position] = response
        } else {
            updated.responses.append(response)
        }
        try updated.validate()
        updated.responses.sort(by: Self.responseOrder)
        self = updated
    }

    func merging(_ other: MessageState) -> MessageState {
        guard (try? validate()) != nil, (try? other.validate()) != nil,
            hasSameCardMetadata(as: other) else { return self }
        var merged = self
        // Validation above guarantees unique identifiers without a trapping
        // Dictionary initializer. Existing local readers are never evicted.
        for response in other.responses.sorted(by: Self.responseOrder) {
            if let index = merged.responses.firstIndex(where: { $0.participantID == response.participantID }) {
                if response.updatedAt > merged.responses[index].updatedAt {
                    merged.responses[index] = response
                }
            } else if merged.responses.count < Self.maximumMembers {
                merged.responses.append(response)
            }
        }
        merged.responses.sort(by: Self.responseOrder)
        return merged
    }

    private func hasSameCardMetadata(as other: MessageState) -> Bool {
        return version == other.version && cardID == other.cardID && kind == other.kind &&
            clubName == other.clubName && meetingTitle == other.meetingTitle &&
            meetingDetail == other.meetingDetail && readingTitle == other.readingTitle &&
            totalPages == other.totalPages && candidates == other.candidates
    }

    private static func responseOrder(_ left: MemberResponse, _ right: MemberResponse) -> Bool {
        let locale = Locale(identifier: "en_US_POSIX")
        let leftName = left.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: locale)
        let rightName = right.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: locale)
        if leftName != rightName { return leftName < rightName }
        return left.participantID < right.participantID
    }

    private func validate() throws {
        guard version == 1 else { throw MessageStateError.unsupportedVersion }
        try Self.validateText(clubName, field: "club name", maximumBytes: 120)
        try Self.validateText(meetingTitle, field: "gathering title", maximumBytes: 160)
        try Self.validateText(meetingDetail, field: "gathering details", maximumBytes: 240)
        try Self.validateText(readingTitle, field: "reading title", maximumBytes: 160)
        guard (1...10_000).contains(totalPages) else { throw MessageStateError.invalidField("page count") }
        guard (2...3).contains(candidates.count), Set(candidates.map { $0.id }).count == candidates.count else {
            throw MessageStateError.invalidCandidates
        }
        for candidate in candidates {
            try Self.validateText(candidate.id, field: "book identifier", maximumBytes: 80)
            try Self.validateText(candidate.title, field: "book title", maximumBytes: 160)
            try Self.validateText(candidate.author, field: "author", maximumBytes: 120)
            try Self.validateText(candidate.reason, field: "book description", maximumBytes: 280)
        }
        guard responses.count <= Self.maximumMembers else { throw MessageStateError.tooManyMembers }
        guard Set(responses.map { $0.participantID }).count == responses.count else { throw MessageStateError.invalidResponse }
        for response in responses {
            try Self.validateText(response.participantID, field: "reader identifier", maximumBytes: 128)
            try Self.validateText(response.name, field: "display name", maximumBytes: 80)
            let timestamp = response.updatedAt.timeIntervalSince1970
            guard timestamp.isFinite, (0...4_102_444_800).contains(timestamp) else { throw MessageStateError.invalidResponse }
            switch kind {
            case .rsvp:
                guard response.rsvp != nil, response.voteID == nil, response.page == nil else { throw MessageStateError.invalidResponse }
            case .vote:
                guard response.rsvp == nil, response.page == nil, let voteID = response.voteID,
                    candidates.contains(where: { $0.id == voteID }) else { throw MessageStateError.invalidResponse }
            case .bookmarks:
                guard response.rsvp == nil, response.voteID == nil, let page = response.page,
                    (0...totalPages).contains(page) else { throw MessageStateError.invalidResponse }
            }
        }
    }

    private static func validateText(_ value: String, field: String, maximumBytes: Int) throws {
        guard !value.isEmpty, value.utf8.count <= maximumBytes,
            value == value.trimmingCharacters(in: .whitespacesAndNewlines),
            value.rangeOfCharacter(from: .controlCharacters) == nil else {
            throw MessageStateError.invalidField(field)
        }
    }
}

extension MessageState {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        // Read the version before interpreting the rest of a future schema.
        let version = try container.decode(Int.self, forKey: .version)
        guard version == 1 else { throw MessageStateError.unsupportedVersion }
        self.init(
            version: version,
            cardID: try container.decode(UUID.self, forKey: .cardID),
            kind: try container.decode(CardKind.self, forKey: .kind),
            clubName: try container.decode(String.self, forKey: .clubName),
            meetingTitle: try container.decode(String.self, forKey: .meetingTitle),
            meetingDetail: try container.decode(String.self, forKey: .meetingDetail),
            readingTitle: try container.decode(String.self, forKey: .readingTitle),
            totalPages: try container.decode(Int.self, forKey: .totalPages),
            candidates: try container.decode([CandidateBook].self, forKey: .candidates),
            responses: try container.decode([MemberResponse].self, forKey: .responses)
        )
        try validate()
        responses.sort(by: Self.responseOrder)
    }
}
