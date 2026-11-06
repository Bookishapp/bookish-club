import Foundation

/// A local display summary. No session, member identifiers, address, or Tea body is stored.
struct WidgetSnapshot: Codable, Equatable {
    let readingTitle: String
    let page: Int
    let totalPages: Int
    let stopPage: Int?
    let stopLabel: String?
    let friendsReading: Int
    let meetingTitle: String?
    let meetingDetail: String?
    let meetingDay: String?
    let going: Bool
    let newTakes: Int
    let sealedTakes: Int
    let chapter: Int?
    var remainingPages: Int? { stopPage.map { max(0, $0 - page) } }

    static func decode(_ data: Data) throws -> WidgetSnapshot {
        guard data.count <= 4096 else { throw CocoaError(.coderInvalidValue) }
        let value = try JSONDecoder().decode(Self.self, from: data)
        let strings = [value.readingTitle, value.stopLabel, value.meetingTitle, value.meetingDetail, value.meetingDay].compactMap { $0 }
        guard !value.readingTitle.isEmpty, strings.allSatisfy({ $0.utf8.count <= 160 && $0.rangeOfCharacter(from: .controlCharacters) == nil }),
              (1...100_000).contains(value.totalPages), (0...value.totalPages).contains(value.page),
              [value.friendsReading, value.newTakes, value.sealedTakes].allSatisfy({ (0...1_000_000).contains($0) }),
              value.stopPage.map({ (0...value.totalPages).contains($0) }) ?? true,
              value.chapter.map({ (0...100_000).contains($0) }) ?? true else { throw CocoaError(.coderInvalidValue) }
        return value
    }
}


enum WidgetSnapshotStore {
    static let group = "group.com.meetbookish.app"
    private static let key = "BookishWidgetDisplaySummary"
    static func read() -> WidgetSnapshot? {
        guard let data = UserDefaults(suiteName: group)?.data(forKey: key) else { return nil }
        return try? WidgetSnapshot.decode(data)
    }
    static func save(_ value: WidgetSnapshot) throws {
        UserDefaults(suiteName: group)?.set(try JSONEncoder().encode(value), forKey: key)
    }
    static func clear() { UserDefaults(suiteName: group)?.removeObject(forKey: key) }
}
